import { Annotation } from "@langchain/langgraph";
import type { Anchor } from "@/lib/schemas/anchor";
import type { BriefConflict } from "@/lib/schemas/brief";
import type { EntityGraph } from "@/lib/schemas/llm";
import type { FactCategory } from "@/lib/schemas/fact";
import type { Warning } from "@/lib/schemas/tools";

/** A fact that has been persisted (id/sourceId are real DB rows). */
export interface StoredFact {
  id: string;
  sourceId: string;
  category: FactCategory;
  tags: string[];
  claim: string;
  quote: string;
  asOfDate: string | null;
  tier: number;
  usefulness: string | null;
}

const concat = <T>(a: T[], b: T[]) => a.concat(b);

/** Shared graph state (PLAN §3). */
export const ResearchState = Annotation.Root({
  runId: Annotation<string>,
  placeId: Annotation<string>,
  anchor: Annotation<Anchor | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  entityGraph: Annotation<EntityGraph | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  facts: Annotation<StoredFact[]>({ reducer: concat, default: () => [] }),
  warnings: Annotation<Warning[]>({ reducer: concat, default: () => [] }),
  searchedQueries: Annotation<string[]>({ reducer: concat, default: () => [] }),
  visitedUrls: Annotation<string[]>({ reducer: concat, default: () => [] }),
  /**
   * Unverified hints mined from tier-4 pages (unit numbers, years, names).
   * Never citable; fed to the expansion planner to verify against tier 1-3.
   */
  leadHints: Annotation<string[]>({ reducer: concat, default: () => [] }),
  round: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  /** Consecutive expansion rounds that produced zero new facts. */
  dryRounds: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  /** Set by N4 verify: the facts that survived; null until verify runs. */
  verifiedFacts: Annotation<StoredFact[] | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  /** Conflicts surfaced by N4 (tier + recency resolution, never silent). */
  conflicts: Annotation<BriefConflict[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
});

export type ResearchStateType = typeof ResearchState.State;
