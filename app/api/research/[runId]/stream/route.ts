import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { researchRuns, runEvents } from "@/lib/db/schema";
import { getRunManager } from "@/lib/research/run-manager";
import type { PersistedRunEvent, RunEvent } from "@/lib/schemas/events";

export const dynamic = "force-dynamic";

/**
 * SSE stream for a run: replays the persisted run_events log first
 * (from Last-Event-ID, so reconnects are lossless), then tails live events.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const db = getDb();
  const [run] = await db
    .select({ id: researchRuns.id, status: researchRuns.status })
    .from(researchRuns)
    .where(eq(researchRuns.id, runId))
    .limit(1);
  if (!run) {
    return new Response("run not found", { status: 404 });
  }

  const url = new URL(req.url);
  const lastEventId = Number(
    req.headers.get("last-event-id") ?? url.searchParams.get("lastEventId") ?? 0,
  );

  const manager = getRunManager();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastSent = Number.isFinite(lastEventId) ? lastEventId : 0;
      let closed = false;
      let unsubscribe: () => void = () => undefined;
      // Assigned once tailing starts; `let` because close() is defined first.
      // eslint-disable-next-line prefer-const
      let ping: ReturnType<typeof setInterval> | undefined;

      const close = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };

      const send = (pe: PersistedRunEvent) => {
        if (closed || pe.seq <= lastSent) return;
        lastSent = pe.seq;
        try {
          controller.enqueue(
            encoder.encode(`id: ${pe.seq}\ndata: ${JSON.stringify(pe.event)}\n\n`),
          );
        } catch {
          close();
          return;
        }
        if (pe.event.type === "run_finished") close();
      };

      // Subscribe before replaying so no live event slips through the gap.
      const buffer: PersistedRunEvent[] = [];
      let replaying = true;
      unsubscribe = manager.subscribe(runId, (pe) => {
        if (replaying) buffer.push(pe);
        else send(pe);
      });

      const rows = await db
        .select({ seq: runEvents.seq, payload: runEvents.payload })
        .from(runEvents)
        .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, lastSent)))
        .orderBy(asc(runEvents.seq));
      for (const row of rows) {
        send({ seq: row.seq, event: row.payload as RunEvent });
      }
      replaying = false;
      for (const pe of buffer) send(pe);

      if (closed) return;
      if (!manager.isActive(runId)) {
        // Nothing live to tail (finished or interrupted run); end the stream.
        close();
        return;
      }

      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          close();
        }
      }, 15_000);
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
