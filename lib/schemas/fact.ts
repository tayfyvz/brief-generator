import { z } from "zod";

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

export const verificationSchema = z.enum([
  "unverified",
  "verified",
  "conflicted",
  "rejected",
]);
export type Verification = z.infer<typeof verificationSchema>;

/** Source trust tier (PLAN §4): 1 authoritative … 4 leads-only. */
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
 * A single cited fact. `sourceId` + verbatim `quote` are mandatory —
 * uncited facts never exist as data (PLAN hard rule).
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
  stale: z.boolean(),
});
export type Fact = z.infer<typeof factSchema>;
