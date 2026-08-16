import { z } from "zod/v4";
import { factCategorySchema } from "./fact";
import { warningSchema } from "./tools";

/**
 * Run events — the single source of truth for what flows over SSE and what
 * is persisted in run_events for lossless replay (PLAN §2).
 */

export const factSummarySchema = z.object({
  id: z.string(),
  category: factCategorySchema,
  claim: z.string(),
  quote: z.string(),
  sourceId: z.string(),
  tier: z.number(),
  asOfDate: z.string().nullable(),
});
export type FactSummary = z.infer<typeof factSummarySchema>;

export const runPhaseSchema = z.enum([
  "anchor",
  "entity",
  "tracks",
  "expansion",
  "verify",
  "synthesize",
]);
export type RunPhase = z.infer<typeof runPhaseSchema>;

export const runEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run_started"), placeId: z.string() }),
  z.object({
    type: z.literal("phase"),
    phase: runPhaseSchema,
    status: z.enum(["start", "done"]),
    /** Expansion round number, when phase === "expansion". */
    round: z.number().optional(),
  }),
  z.object({
    type: z.literal("track_update"),
    track: z.string(),
    status: z.enum(["running", "done"]),
    searchCount: z.number(),
    factCount: z.number(),
  }),
  z.object({ type: z.literal("fact_added"), fact: factSummarySchema }),
  z.object({ type: z.literal("warning"), warning: warningSchema }),
  z.object({
    type: z.literal("run_finished"),
    status: z.enum(["done", "failed", "interrupted"]),
    factCount: z.number(),
    capsHit: z.array(z.string()),
    error: z.string().optional(),
  }),
]);
export type RunEvent = z.infer<typeof runEventSchema>;

/** What actually goes over the wire / into run_events. */
export const persistedRunEventSchema = z.object({
  seq: z.number(),
  event: runEventSchema,
});
export type PersistedRunEvent = z.infer<typeof persistedRunEventSchema>;

export type EmitFn = (event: RunEvent) => void;
