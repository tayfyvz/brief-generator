import { z } from "zod";

/**
 * Brief content (briefs.content JSONB). The brief references facts by id;
 * fact/source rows remain the citation source of truth. Sections map fact
 * categories → UI: leadership → "Who to call", fleet → "What they drive",
 * procurement+funding → "Money moving", news → "Recent signals",
 * other → "Also found".
 */
export const briefSectionKeySchema = z.enum([
  "leadership",
  "fleet",
  "money",
  "news",
]);
export type BriefSectionKey = z.infer<typeof briefSectionKeySchema>;

/** A ranked, dated "why call today" signal — the 10-second read. */
export const briefSignalSchema = z.object({
  headline: z.string().min(1),
  detail: z.string().optional(),
  date: z.string().optional(), // ISO date if known
  factIds: z.array(z.string().uuid()).min(1),
});
export type BriefSignal = z.infer<typeof briefSignalSchema>;

export const briefConflictSchema = z.object({
  topic: z.string(),
  note: z.string(),
  factIds: z.array(z.string().uuid()),
});
export type BriefConflict = z.infer<typeof briefConflictSchema>;

export const briefContentSchema = z.object({
  /** One-paragraph AE orientation: who they are, what matters right now. */
  summary: z.string().optional(),
  whyCallToday: z.array(briefSignalSchema).max(3),
  /** Curated top facts per section, in display order; the rest render under "Show all". */
  curatedFactIds: z.record(briefSectionKeySchema, z.array(z.string().uuid())),
  conflicts: z.array(briefConflictSchema).default([]),
  /** Honest gaps: what we could not establish ("no chief name found"). */
  caveats: z.array(z.string()).default([]),
  generatedAt: z.string(), // ISO datetime
});
export type BriefContent = z.infer<typeof briefContentSchema>;
