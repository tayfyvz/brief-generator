"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { runEventSchema } from "@/lib/schemas/events";
import { cn } from "@/lib/utils";

/**
 * Home page live view: every research run in flight, with its current step
 * and fact count streaming in over the same SSE endpoint the brief page
 * uses. A run started in another tab shows up here immediately.
 */

interface ActiveRunInfo {
  runId: string;
  placeId: string;
  name: string | null;
}

interface RunView extends ActiveRunInfo {
  status: "running" | "done" | "failed" | "interrupted";
  step: string;
  factCount: number;
  lastClaim: string | null;
}

const PHASE_STEPS: Record<string, string> = {
  anchor: "Resolving place",
  entity: "Identifying department",
  tracks: "Researching sources",
  verify: "Verifying facts",
  synthesize: "Writing brief",
};

export function ActiveRuns() {
  const router = useRouter();
  const [runs, setRuns] = useState<Record<string, RunView>>({});
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());

  const attach = useCallback(
    (info: ActiveRunInfo) => {
      if (sourcesRef.current.has(info.runId)) return;
      setRuns((prev) => ({
        ...prev,
        [info.runId]: {
          ...info,
          status: "running",
          step: "Starting research",
          factCount: 0,
          lastClaim: null,
        },
      }));
      const es = new EventSource(`/api/research/${info.runId}/stream`);
      sourcesRef.current.set(info.runId, es);
      es.onmessage = (msg) => {
        const parsed = runEventSchema.safeParse(JSON.parse(msg.data));
        if (!parsed.success) return;
        const event = parsed.data;
        setRuns((prev) => {
          const run = prev[info.runId];
          if (!run) return prev;
          const next = { ...run };
          switch (event.type) {
            case "phase":
              if (event.phase === "expansion") {
                next.step = event.round
                  ? `Expanding leads (round ${event.round})`
                  : "Expanding leads";
              } else {
                next.step = PHASE_STEPS[event.phase] ?? event.phase;
              }
              break;
            case "track_update":
              next.step = "Researching sources";
              break;
            case "fact_added":
              next.factCount += 1;
              next.lastClaim = event.fact.claim;
              break;
            case "run_finished":
              next.status = event.status;
              next.step =
                event.status === "done"
                  ? "Brief ready"
                  : event.status === "failed"
                    ? "Research failed"
                    : "Interrupted";
              break;
          }
          return { ...prev, [info.runId]: next };
        });
        if (event.type === "run_finished") {
          es.close();
          sourcesRef.current.delete(info.runId);
          // Pull the fresh department name / recent-briefs list.
          router.refresh();
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects with Last-Event-ID; nothing to do.
      };
    },
    [router],
  );

  const discover = useCallback(async () => {
    try {
      const res = await fetch("/api/research/active");
      if (!res.ok) return;
      const data = (await res.json()) as { runs: ActiveRunInfo[] };
      for (const info of data.runs) attach(info);
    } catch {
      // offline; try again on next focus
    }
  }, [attach]);

  useEffect(() => {
    void discover();
    const onFocus = () => void discover();
    window.addEventListener("focus", onFocus);
    const sources = sourcesRef.current;
    return () => {
      window.removeEventListener("focus", onFocus);
      for (const es of sources.values()) es.close();
      sources.clear();
    };
  }, [discover]);

  const list = Object.values(runs);
  if (list.length === 0) return null;

  return (
    <section className="fade-up w-full max-w-3xl">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="live-dot size-1.5 rounded-full bg-primary" />
        Researching now
      </h2>
      <ul className="space-y-2">
        {list.map((run) => (
          <li key={run.runId}>
            <Link
              href={`/brief/${run.placeId}`}
              className={cn(
                "group block overflow-hidden rounded-xl border bg-card px-4 py-3 shadow-sm transition hover:shadow-md",
                run.status === "running" && "border-primary/40",
              )}
            >
              <div className="flex items-center gap-2">
                {run.status === "running" && (
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                )}
                {run.status === "done" && (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                )}
                {(run.status === "failed" || run.status === "interrupted") && (
                  <TriangleAlert className="size-4 shrink-0 text-destructive" />
                )}
                <span className="truncate font-medium">
                  {run.name ?? "Resolving department…"}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {run.factCount > 0 && (
                    <span className="tabular-nums">{run.factCount} facts</span>
                  )}
                  <ArrowRight className="size-3 opacity-0 transition group-hover:opacity-100" />
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {run.step}
                {run.status === "running" && run.lastClaim && (
                  <span className="ml-2 text-muted-foreground/70">
                    · {run.lastClaim}
                  </span>
                )}
              </p>
              {run.status === "running" && (
                <div className="shimmer mt-2.5 h-1 rounded-full" aria-hidden />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
