"use client";

import { create } from "zustand";
import { runEventSchema } from "@/lib/schemas/events";
import type { FactSummary, RunEvent, RunPhase } from "@/lib/schemas/events";
import type { Warning } from "@/lib/schemas/tools";

/**
 * The one client store: live-run state fed by the SSE subscriber, plus the
 * brief-page context so the site header can render the run controls.
 * Cached briefs never touch this; they are server-rendered.
 */
export type TrackLiveState = {
  status: "pending" | "running" | "done";
  searchCount: number;
  factCount: number;
};

/** What the header needs to offer Update / Start fresh / Resume for a brief. */
export interface BriefCtx {
  placeId: string;
  hasBrief: boolean;
  /** ISO datetime of the cached brief, if one exists. */
  researchedAt: string | null;
  /** Latest run is interrupted and can be resumed. */
  interruptedRunId: string | null;
}

export interface RunStoreState {
  runId: string | null;
  status: "idle" | "starting" | "running" | "done" | "failed" | "interrupted";
  phases: Partial<Record<RunPhase, "start" | "done">>;
  round: number;
  tracks: Record<string, TrackLiveState>;
  facts: FactSummary[];
  warnings: Warning[];
  capsHit: string[];
  /** Most recent search query issued (live "what is it doing" signal). */
  lastSearch: string | null;
  error?: string;
  briefCtx: BriefCtx | null;

  setBriefCtx(ctx: BriefCtx): void;
  clearBriefCtx(): void;
  /** Subscribe to an existing run's SSE stream. */
  attachRun(runId: string): void;
  /** Kick off (or resume) a research run, then subscribe to it. */
  startResearch(body: {
    placeId?: string;
    resumeRunId?: string;
    fresh?: boolean;
  }): Promise<void>;
  /** Close the SSE subscription (leaving the page). */
  detach(): void;
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
  lastSearch: null,
  error: undefined,
};

// One EventSource for the brief page's run; module-level so store actions
// from any component (header buttons, page controller) share it.
let es: EventSource | null = null;

export const useRunStore = create<RunStoreState>((set, get) => ({
  ...initial,
  briefCtx: null,

  setBriefCtx: (briefCtx) => set({ briefCtx }),
  clearBriefCtx: () => set({ briefCtx: null }),
  reset: () => set({ ...initial }),

  detach: () => {
    es?.close();
    es = null;
  },

  attachRun: (runId) => {
    set({ ...initial, runId, status: "running" });
    es?.close();
    es = new EventSource(`/api/research/${runId}/stream`);
    es.onmessage = (msg) => {
      const parsed = runEventSchema.safeParse(JSON.parse(msg.data));
      if (!parsed.success) return;
      get().apply(parsed.data);
      if (parsed.data.type === "run_finished") {
        es?.close();
        es = null;
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects with Last-Event-ID; nothing to do.
    };
  },

  startResearch: async (body) => {
    set({ ...initial, status: "starting" });
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { runId: string };
      get().attachRun(data.runId);
    } catch (err) {
      console.error("failed to start research", err);
      set({ ...initial });
    }
  },

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
        case "search":
          return { lastSearch: event.query };
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
