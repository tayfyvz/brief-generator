"use client";

import {
  Banknote,
  Check,
  Compass,
  Gavel,
  Loader2,
  Newspaper,
  Search,
  TriangleAlert,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TRACKS } from "@/lib/graph/tracks";
import { useRunStore } from "@/lib/stores/run-store";
import { cn } from "@/lib/utils";
import type { RunPhase } from "@/lib/schemas/events";

/** Live run view: progress bar + phase stepper + track cards + fact feed. */

type StepState = "pending" | "running" | "done";

const TRACK_ICONS: Record<string, LucideIcon> = {
  leadership: Users,
  fleet: Truck,
  procurement: Gavel,
  funding: Banknote,
  news: Newspaper,
  discovery: Compass,
};

function phaseState(
  phases: Partial<Record<RunPhase, "start" | "done">>,
  phase: RunPhase,
): StepState {
  const s = phases[phase];
  if (s === "done") return "done";
  if (s === "start") return "running";
  return "pending";
}

/** Rough overall progress so the reader can see how far along the run is. */
function overallProgress(args: {
  phases: Partial<Record<RunPhase, "start" | "done">>;
  tracksFraction: number;
  round: number;
  maxRounds: number;
  status: string;
}): number {
  const { phases, tracksFraction, round, maxRounds, status } = args;
  if (status === "done") return 1;
  const part = (s: StepState) => (s === "done" ? 1 : s === "running" ? 0.5 : 0);
  const expansion =
    phaseState(phases, "expansion") === "done"
      ? 1
      : maxRounds > 0
        ? Math.min(round / maxRounds, 0.95)
        : 0;
  const pct =
    0.06 * part(phaseState(phases, "anchor")) +
    0.06 * part(phaseState(phases, "entity")) +
    0.46 * tracksFraction +
    0.22 * expansion +
    0.1 * part(phaseState(phases, "verify")) +
    0.1 * part(phaseState(phases, "synthesize"));
  return Math.min(pct, 0.98);
}

function StepDot({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  if (state === "running")
    return (
      <span className="flex size-5 items-center justify-center rounded-full border-2 border-primary bg-primary/10">
        <Loader2 className="size-3 animate-spin text-primary" />
      </span>
    );
  return <span className="size-5 rounded-full border-2 border-border bg-muted" />;
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

  const trackValues = Object.values(tracks);
  const tracksState: StepState =
    trackValues.length === 0
      ? "pending"
      : trackValues.every((t) => t.status === "done")
        ? "done"
        : "running";
  const tracksFraction =
    tracksState === "done"
      ? 1
      : trackValues.length === 0
        ? 0
        : trackValues.filter((t) => t.status === "done").length / TRACKS.length +
          0.5 *
            (trackValues.filter((t) => t.status === "running").length /
              TRACKS.length);

  const steps: { label: string; state: StepState }[] = [
    { label: "Find place", state: phaseState(phases, "anchor") },
    { label: "Identify dept", state: phaseState(phases, "entity") },
    { label: "Research", state: tracksState },
    {
      label: round > 0 ? `Expand ${round}/${maxRounds}` : "Expand leads",
      state: phaseState(phases, "expansion"),
    },
    { label: "Verify", state: phaseState(phases, "verify") },
    { label: "Write brief", state: phaseState(phases, "synthesize") },
  ];

  const progress = overallProgress({
    phases,
    tracksFraction,
    round,
    maxRounds,
    status,
  });

  return (
    <section
      aria-live="polite"
      className="fade-up mt-6 overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          {status === "failed" ? (
            <span className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <TriangleAlert className="size-4" />
            </span>
          ) : (
            <span className="relative flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Loader2 className="size-4 animate-spin" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              {status === "failed"
                ? "Research failed"
                : status === "done"
                  ? "Research complete"
                  : "Researching live"}
            </h2>
            {(status === "running" || status === "starting") && lastSearch && (
              <p
                key={lastSearch}
                className="fade-up truncate text-xs text-muted-foreground"
              >
                <Search className="mr-1 inline size-3" />
                Searching: <span className="italic">“{lastSearch}”</span>
              </p>
            )}
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
            {facts.length} fact{facts.length === 1 ? "" : "s"} verified
          </span>
        </div>

        {/* Overall progress */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Research progress"
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out",
              status === "failed" ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${Math.max(progress * 100, 3)}%` }}
          />
        </div>

        {/* Phase stepper */}
        <ol className="mt-4 flex flex-wrap items-center gap-y-2">
          {steps.map((step, i) => (
            <li key={step.label} className="flex items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1.5 hidden h-px w-4 sm:block lg:w-7",
                    step.state === "pending" ? "bg-border" : "bg-primary/40",
                  )}
                />
              )}
              <span className="mr-3 flex items-center gap-1.5 text-xs sm:mr-0 sm:text-sm">
                <StepDot state={step.state} />
                <span
                  className={cn(
                    step.state === "pending" && "text-muted-foreground/60",
                    step.state === "running" && "font-medium text-primary",
                    step.state === "done" && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {/* Track cards */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {TRACKS.map((track) => {
            const t = tracks[track.key];
            const Icon = TRACK_ICONS[track.key] ?? Search;
            return (
              <div
                key={track.key}
                className={cn(
                  "rounded-lg border p-2.5 text-xs transition",
                  !t && "opacity-50",
                  t?.status === "running" &&
                    "border-primary/40 bg-primary/[0.04]",
                  t?.status === "done" && "bg-card",
                )}
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      t?.status === "running"
                        ? "text-primary"
                        : t?.status === "done"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate">{track.title}</span>
                </div>
                <p className="mt-1 tabular-nums text-muted-foreground">
                  {t
                    ? `${t.factCount} fact${t.factCount === 1 ? "" : "s"}`
                    : "queued"}
                  {t?.status === "running" && (
                    <Loader2 className="ml-1 inline size-3 animate-spin text-primary/70" />
                  )}
                </p>
              </div>
            );
          })}
        </div>

        {/* Facts land here as they're verified into the run */}
        {facts.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Verified facts, newest first
            </p>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {facts
                .slice()
                .reverse()
                .map((fact) => (
                  <li
                    key={fact.id}
                    className="animate-in fade-in slide-in-from-bottom-1 rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    <Badge variant="secondary" className="mr-2 align-middle">
                      {fact.category}
                    </Badge>
                    {fact.claim}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {(warnings.length > 0 || capsHit.length > 0 || error) && (
          <div className="mt-3 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            {error && <p className="font-medium text-destructive">Error: {error}</p>}
            {capsHit.length > 0 && (
              <p>
                Budget reached ({capsHit.join(", ")}); finished with what we had.
              </p>
            )}
            {warnings.map((w, i) => (
              <p key={i}>
                [{w.scope}] {w.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
