"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Clock, Play, RefreshCw, RotateCcw } from "lucide-react";
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
    async (body: { placeId?: string; resumeRunId?: string; fresh?: boolean }) => {
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
      <div className="flex flex-wrap items-center gap-2">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <span className="live-dot size-1.5 rounded-full bg-primary" />
            Researching live
          </span>
        ) : (
          <>
            {researchedAt && (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                Updated {relativeDays(researchedAt)}
                {status === "done" && runId && " · just now"}
              </span>
            )}
            {interruptedRunId && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                title="Continue the interrupted run where it left off."
                onClick={() => void start({ resumeRunId: interruptedRunId })}
              >
                <Play className="size-3" /> Resume research
              </Button>
            )}
            {(hasBrief || status === "done" || status === "failed") && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  title="Rerun research, keeping every verified fact from the last run and spending the budget on gaps."
                  onClick={() => void start({ placeId })}
                >
                  <RefreshCw className="size-3" /> Update brief
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs text-muted-foreground"
                  title="Rerun from scratch without carrying forward previous facts (prior runs stay in the database)."
                  onClick={() => void start({ placeId, fresh: true })}
                >
                  <RotateCcw className="size-3" /> Start fresh
                </Button>
              </>
            )}
          </>
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
