"use client";

import { create } from "zustand";
import type { FactSummary, RunEvent, RunPhase } from "@/lib/schemas/events";
import type { Warning } from "@/lib/schemas/tools";

/**
 * The one client store (PLAN §6): live-run state fed by the SSE subscriber.
 * Cached briefs never touch this — they are server-rendered.
 */
export type TrackLiveState = {
  status: "pending" | "running" | "done";
  searchCount: number;
  factCount: number;
};

export interface RunStoreState {
  runId: string | null;
  status: "idle" | "starting" | "running" | "done" | "failed" | "interrupted";
  phases: Partial<Record<RunPhase, "start" | "done">>;
  round: number;
  tracks: Record<string, TrackLiveState>;
  facts: FactSummary[];
  warnings: Warning[];
  capsHit: string[];
  error?: string;

  begin(runId: string): void;
  markStarting(): void;
  apply(event: RunEvent): void;
  reset(): void;
}

const initial = {
  runId: null,
  status: "idle" as const,
  phases: {},
  round: 0,
  tracks: {},
  facts: [],
  warnings: [],
  capsHit: [],
  error: undefined,
};

export const useRunStore = create<RunStoreState>((set) => ({
  ...initial,

  begin: (runId) => set({ ...initial, runId, status: "running" }),
  markStarting: () => set({ ...initial, status: "starting" }),
  reset: () => set({ ...initial }),

  apply: (event) =>
    set((state) => {
      switch (event.type) {
        case "run_started":
          return { status: "running" };
        case "phase":
          return {
            phases: { ...state.phases, [event.phase]: event.status },
            round: event.round ?? state.round,
          };
        case "track_update":
          return {
            tracks: {
              ...state.tracks,
              [event.track]: {
                status: event.status === "done" ? "done" : "running",
                searchCount: event.searchCount,
                factCount: event.factCount,
              },
            },
          };
        case "fact_added":
          return { facts: [...state.facts, event.fact] };
        case "warning":
          return { warnings: [...state.warnings, event.warning] };
        case "run_finished":
          return {
            status: event.status,
            capsHit: event.capsHit,
            error: event.error,
          };
        default:
          return {};
      }
    }),
}));
