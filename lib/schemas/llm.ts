import { z } from "zod/v4";
import { confidenceSchema, factCategorySchema, usefulnessSchema } from "./fact";

/**
 * Structured-output schemas for LLM calls (single source of truth for what
 * the model must return at each pipeline node). Kept free of z.record and
 * numeric/string constraints the structured-outputs API doesn't support.
 */

/** N1 resolveEntity output: who operates the station, who buys the trucks. */
export const entityGraphSchema = z.object({
  entities: z.array(
    z.object({
      /** parent_org | municipality | county | board | dealer | manufacturer | person | other */
      kind: z.string(),
      name: z.string(),
      /** Free-form details, e.g. { role, website, represents }. */
      note: z.string().optional(),
      /** Relations to other entities by name, e.g. "operates Weehawken FD". */
      relations: z.array(z.string()).optional(),
    }),
  ),
  /** Domains that count as the department's own official web presence. */
  officialDomains: z.array(z.string()),
  /** One-line answer: who actually purchases apparatus for this station? */
  buyerSummary: z.string(),
});
export type EntityGraph = z.infer<typeof entityGraphSchema>;

/**
 * Relevance gate over search results: which URLs are worth a fetch for THIS
 * department. Blind top-N fetching burned entire fetch budgets on
 * similarly-named departments in other states (observed failure mode).
 */
export const selectedResultsSchema = z.object({
  /** URLs worth fetching, best first; empty when nothing is relevant. */
  urls: z.array(z.string()),
});
export type SelectedResults = z.infer<typeof selectedResultsSchema>;

/** Track planning output: the searches a research track wants to run. */
export const trackPlanSchema = z.object({
  queries: z.array(z.string()),
});
export type TrackPlan = z.infer<typeof trackPlanSchema>;

/** Fact extraction output for one fetched page. */
export const extractedFactSchema = z.object({
  category: factCategorySchema,
  tags: z.array(z.string()),
  claim: z.string(),
  /** VERBATIM substring of the page; validated, fact dropped if absent. */
  quote: z.string(),
  /** ISO date (yyyy-mm-dd) the fact is current as of, if stated. */
  asOfDate: z.string().nullable(),
  confidence: confidenceSchema,
  /** Sales usefulness to the AE; orders facts in the brief (see fact.ts). */
  usefulness: usefulnessSchema,
});
export const extractedFactsSchema = z.object({
  facts: z.array(extractedFactSchema),
});
export type ExtractedFact = z.infer<typeof extractedFactSchema>;

/** N3 planExpansion output: new leads from what earlier rounds discovered. */
export const expansionLeadSchema = z.object({
  /** "search" = keyword query (Tavily); "similar" = Exa find-similar on a URL. */
  kind: z.enum(["search", "similar"]),
  /** The query text, or the URL to find pages similar to. */
  query: z.string(),
  reason: z.string(),
});
export type ExpansionLead = z.infer<typeof expansionLeadSchema>;

export const expansionPlanSchema = z.object({
  leads: z.array(expansionLeadSchema),
  /** Completeness critic: what would an AE ask that we still can't answer? */
  criticNote: z.string(),
});
export type ExpansionPlan = z.infer<typeof expansionPlanSchema>;

/** N4 verify output: fresh-context judgment of each (claim, quote) pair. */
export const verifyVerdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      factId: z.string(),
      /** supported = quote genuinely backs the claim for THIS department. */
      verdict: z.enum(["supported", "unsupported"]),
      note: z.string().optional(),
    }),
  ),
  /**
   * Groups of facts that restate the same information. One canonical fact is
   * kept (best tier, most detail, most recent); the rest are hidden as
   * duplicates. Restatements are NOT conflicts.
   */
  duplicates: z.array(
    z.object({
      topic: z.string(),
      /** The fact to keep and render. */
      keepFactId: z.string(),
      /** The restatements to hide. */
      dropFactIds: z.array(z.string()),
    }),
  ),
  /**
   * Groups of facts that genuinely contradict each other: they cannot all be
   * true (two different chiefs, two different years for the same unit).
   * Surfaced in the brief, never silently picked.
   */
  conflicts: z.array(
    z.object({
      topic: z.string(),
      factIds: z.array(z.string()),
      /** Which fact wins and why (tier first, then recency). */
      note: z.string(),
    }),
  ),
});
export type VerifyVerdicts = z.infer<typeof verifyVerdictsSchema>;

/** N5 synthesize output; maps onto BriefContent (generatedAt added by code). */
export const llmBriefSchema = z.object({
  summary: z.string(),
  whyCallToday: z.array(
    z.object({
      headline: z.string(),
      detail: z.string().optional(),
      date: z.string().optional(),
      factIds: z.array(z.string()),
    }),
  ),
  curated: z.object({
    leadership: z.array(z.string()),
    fleet: z.array(z.string()),
    money: z.array(z.string()),
    news: z.array(z.string()),
  }),
  conflicts: z.array(
    z.object({
      topic: z.string(),
      note: z.string(),
      factIds: z.array(z.string()),
    }),
  ),
  caveats: z.array(z.string()),
});
export type LlmBrief = z.infer<typeof llmBriefSchema>;
