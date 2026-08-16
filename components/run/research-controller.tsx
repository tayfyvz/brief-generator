"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveRun } from "./live-run";
import { useRunStore } from "@/lib/stores/run-store";
import { runEventSchema } from "@/lib/schemas/events";
import { relativeDays } from "@/lib/format";

/**
 * Client controller for the brief page: starts/joins/resumes research runs,
 * subscribes to the SSE stream, and refreshes the server-rendered brief when
 * a run finishes. Auto-starts when no brief exists yet (the assignment flow:
 * paste a Place ID → researched live on the spot).
 */
export function ResearchController({
  placeId,
  hasBrief,
  researchedAt,
  activeRunId,
  interruptedRunId,
  maxRounds = 4,
}: {
  placeId: string;
  hasBrief: boolean;
  maxRounds?: number;
  /** ISO datetime of the cached brief, if one exists. */
  researchedAt: string | null;
  /** A run already in flight for this place (join it on load). */
  activeRunId: string | null;
  /** Latest run is interrupted and can be resumed. */
  interruptedRunId: string | null;
}) {
  const router = useRouter();
  const status = useRunStore((s) => s.status);
  const begin = useRunStore((s) => s.begin);
  const markStarting = useRunStore((s) => s.markStarting);
  const apply = useRunStore((s) => s.apply);
  const reset = useRunStore((s) => s.reset);
  const runId = useRunStore((s) => s.runId);
  const esRef = useRef<EventSource | null>(null);
  const startedRef = useRef(false);

  const attach = useCallback(
    (id: string) => {
      begin(id);
      esRef.current?.close();
      const es = new EventSource(`/api/research/${id}/stream`);
      esRef.current = es;
      es.onmessage = (msg) => {
        const parsed = runEventSchema.safeParse(JSON.parse(msg.data));
        if (!parsed.success) return;
        apply(parsed.data);
        if (parsed.data.type === "run_finished") {
          es.close();
          esRef.current = null;
          router.refresh();
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects with Last-Event-ID; nothing to do.
      };
    },
    [apply, begin, router],
  );

  const start = useCallback(
    async (body: Record<string, string>) => {
      markStarting();
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { runId: string };
        attach(data.runId);
      } catch (err) {
        console.error("failed to start research", err);
        reset();
      }
    },
    [attach, markStarting, reset],
  );

  // On load: join an active run, or auto-start when there is no brief yet.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (activeRunId) {
      attach(activeRunId);
    } else if (!hasBrief && !interruptedRunId) {
      void start({ placeId });
    }
    return () => esRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const live = status === "starting" || status === "running";

  // Fragment: the actions row slots into the page header (right-aligned),
  // while the live-run panel breaks onto its own full-width line.
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {researchedAt && <span>Researched {relativeDays(researchedAt)}</span>}
        {status === "done" && runId && <span>· just updated</span>}
        {!live && interruptedRunId && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void start({ resumeRunId: interruptedRunId })}
          >
            <RefreshCw className="size-3" /> Resume interrupted run
          </Button>
        )}
        {!live && (hasBrief || status === "done" || status === "failed") && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void start({ placeId })}
          >
            <RefreshCw className="size-3" /> Refresh
          </Button>
        )}
      </div>
      {(live || status === "failed") && (
        <div className="w-full">
          <LiveRun maxRounds={maxRounds} />
        </div>
      )}
    </>
  );
}
