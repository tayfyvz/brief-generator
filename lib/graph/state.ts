import { Annotation } from "@langchain/langgraph";
import type { Anchor } from "@/lib/schemas/anchor";
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
  round: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
});

export type ResearchStateType = typeof ResearchState.State;
