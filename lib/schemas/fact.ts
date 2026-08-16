import { z } from "zod/v4";

export const factCategorySchema = z.enum([
  "leadership",
  "fleet",
  "procurement",
  "funding",
  "news",
  "other",
]);
export type FactCategory = z.infer<typeof factCategorySchema>;

export const confidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof confidenceSchema>;

/**
 * Sales usefulness of a fact to the AE, judged at extraction time:
 * high = changes what the AE says on this call (current apparatus and its age,
 * money in motion, open bids, decision makers); medium = helpful background
 * (department profile, staffing model, buying process); low = context only.
 * Orders facts within brief sections; low sinks to the bottom.
 */
export const usefulnessSchema = z.enum(["high", "medium", "low"]);
export type Usefulness = z.infer<typeof usefulnessSchema>;

/**
 * duplicate = a restatement of information another fact already carries; kept
 * in the database for provenance but never rendered (the kept fact is).
 */
export const verificationSchema = z.enum([
  "unverified",
  "verified",
  "conflicted",
  "rejected",
  "duplicate",
]);
export type Verification = z.infer<typeof verificationSchema>;

/** Source trust tier: 1 authoritative … 4 community (unconfirmed). */
export const tierSchema = z.number().int().min(1).max(4);

export const sourceSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  url: z.string().url(),
  title: z.string().nullable(),
  tier: tierSchema.nullable(),
  contentMd: z.string().nullable(),
  contentHash: z.string().nullable(),
  fetchedAt: z.coerce.date().nullable(),
  publishedAt: z.string().nullable(), // ISO date (yyyy-mm-dd)
});
export type Source = z.infer<typeof sourceSchema>;

/**
 * A single cited fact. `sourceId` + verbatim `quote` are mandatory;
 * uncited facts never exist as data.
 */
export const factSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  placeId: z.string(),
  sourceId: z.string().uuid(),
  category: factCategorySchema,
  tags: z.array(z.string()),
  claim: z.string().min(1),
  quote: z.string().min(1),
  asOfDate: z.string().nullable(), // ISO date (yyyy-mm-dd)
  discoveredRound: z.number().int().nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  verification: verificationSchema.nullable(),
  confidence: confidenceSchema.nullable(),
  usefulness: usefulnessSchema.nullable(),
  stale: z.boolean(),
});
export type Fact = z.infer<typeof factSchema>;
