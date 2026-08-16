"use client";

import { CheckCircle2, Circle, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TRACKS } from "@/lib/graph/tracks";
import { useRunStore } from "@/lib/stores/run-store";
import { cn } from "@/lib/utils";
import type { RunPhase } from "@/lib/schemas/events";

/** Live run view: phase timeline + track cards + facts landing. */

function PhaseDot({ state }: { state: "pending" | "running" | "done" }) {
  if (state === "done") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (state === "running")
    return <Loader2 className="size-4 animate-spin text-primary" />;
  return <Circle className="size-4 text-muted-foreground/40" />;
}

function phaseState(
  phases: Partial<Record<RunPhase, "start" | "done">>,
  phase: RunPhase,
): "pending" | "running" | "done" {
  const s = phases[phase];
  if (s === "done") return "done";
  if (s === "start") return "running";
  return "pending";
}

export function LiveRun({ maxRounds }: { maxRounds: number }) {
  const {
    status,
    phases,
    round,
    tracks,
    facts,
    warnings,
    capsHit,
    lastSearch,
    error,
  } = useRunStore();

  const tracksState: "pending" | "running" | "done" =
    Object.keys(tracks).length === 0
      ? "pending"
      : Object.values(tracks).every((t) => t.status === "done")
        ? "done"
        : "running";

  const steps: { label: string; state: "pending" | "running" | "done" }[] = [
    { label: "Anchor", state: phaseState(phases, "anchor") },
    { label: "Entity", state: phaseState(phases, "entity") },
    { label: "6 tracks", state: tracksState },
    {
      label: round > 0 ? `Expansion ${round}/${maxRounds}` : "Expansion",
      state: phaseState(phases, "expansion"),
    },
    { label: "Verify", state: phaseState(phases, "verify") },
    { label: "Brief", state: phaseState(phases, "synthesize") },
  ];

  return (
    <section className="mt-6 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {status === "failed" ? (
          <TriangleAlert className="size-4 text-destructive" />
        ) : (
          <Loader2 className="size-4 animate-spin text-primary" />
        )}
        <h2 className="text-sm font-semibold">
          {status === "failed"
            ? "Research failed"
            : status === "done"
              ? "Research complete"
              : "Researching live…"}
        </h2>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {facts.length} fact{facts.length === 1 ? "" : "s"} found
        </span>
      </div>

      {/* Phase timeline */}
      <ol className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-1.5 text-sm">
            <PhaseDot state={step.state} />
            <span
              className={cn(
                step.state === "pending" && "text-muted-foreground/60",
                step.state === "running" && "font-medium",
              )}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {(status === "running" || status === "starting") && lastSearch && (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          Searching: <span className="italic">“{lastSearch}”</span>
        </p>
      )}

      {/* Track cards */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {TRACKS.map((track) => {
          const t = tracks[track.key];
          return (
            <div
              key={track.key}
              className={cn(
                "rounded-md border p-2 text-xs transition",
                !t && "opacity-50",
                t?.status === "running" && "border-primary/50",
              )}
            >
              <div className="flex items-center gap-1 font-medium">
                <PhaseDot state={t?.status ?? "pending"} />
                <span className="truncate">{track.title}</span>
              </div>
              <p className="mt-1 tabular-nums text-muted-foreground">
                {t ? `${t.factCount} facts` : "queued"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Facts land here as they're verified into the run */}
      {facts.length > 0 && (
        <ul className="mt-4 max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {facts
            .slice()
            .reverse()
            .map((fact) => (
              <li
                key={fact.id}
                className="animate-in fade-in slide-in-from-bottom-1 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <Badge variant="secondary" className="mr-2 align-middle">
                  {fact.category}
                </Badge>
                {fact.claim}
              </li>
            ))}
        </ul>
      )}

      {(warnings.length > 0 || capsHit.length > 0 || error) && (
        <div className="mt-3 space-y-1 text-xs text-amber-600 dark:text-amber-400">
          {error && <p className="text-destructive">Error: {error}</p>}
          {capsHit.length > 0 && (
            <p>Budget reached ({capsHit.join(", ")}); finished with what we had.</p>
          )}
          {warnings.map((w, i) => (
            <p key={i}>
              [{w.scope}] {w.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
