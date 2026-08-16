"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LiveRun } from "./live-run";
import { useRunStore } from "@/lib/stores/run-store";

/**
 * Client controller for the brief page: publishes the brief context (so the
 * site header can render Update / Start fresh / Resume), starts or joins
 * research runs, and refreshes the server-rendered brief when a run
 * finishes. Auto-starts when no brief exists yet (the assignment flow:
 * paste a Place ID → researched live on the spot). Renders the live-run
 * panel while a run is in flight.
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
  const setBriefCtx = useRunStore((s) => s.setBriefCtx);
  const clearBriefCtx = useRunStore((s) => s.clearBriefCtx);
  const attachRun = useRunStore((s) => s.attachRun);
  const startResearch = useRunStore((s) => s.startResearch);
  const detach = useRunStore((s) => s.detach);
  const startedRef = useRef(false);
  const refreshedRef = useRef(false);

  // Keep the header's run controls in sync with the server-rendered state.
  useEffect(() => {
    setBriefCtx({ placeId, hasBrief, researchedAt, interruptedRunId });
  }, [placeId, hasBrief, researchedAt, interruptedRunId, setBriefCtx]);

  // On load: join an active run, or auto-start when there is no brief yet.
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      if (activeRunId) {
        attachRun(activeRunId);
      } else if (!hasBrief && !interruptedRunId) {
        void startResearch({ placeId });
      }
    }
    return () => {
      detach();
      clearBriefCtx();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A finished run means fresh server data: pull the new brief in place.
  useEffect(() => {
    if (status === "starting" || status === "running") {
      refreshedRef.current = false;
    } else if (
      (status === "done" || status === "failed" || status === "interrupted") &&
      !refreshedRef.current
    ) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [status, router]);

  const live = status === "starting" || status === "running";
  if (!live && status !== "failed") return null;

  return <LiveRun maxRounds={maxRounds} />;
}
