import { anchorPacket } from "@/lib/llm/prompts/anchor";
import { SELECT_RESULTS_SYSTEM } from "@/lib/llm/prompts/select";
import {
  EXTRACT_SYSTEM,
  QUOTE_REPAIR_NOTE,
  TIER4_EXTRACT_NOTE,
} from "@/lib/llm/prompts/extract";
import { storeExtractedFacts } from "@/lib/research/facts";
import { anchorTerms, extractionSlice } from "@/lib/research/markdown";
import { withDegrade } from "@/lib/tools/retry";
import { extractedFactsSchema, selectedResultsSchema } from "@/lib/schemas/llm";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { EmitFn } from "@/lib/schemas/events";
import type { FetchedPage, SearchResult, Warning } from "@/lib/schemas/tools";
import type { LlmClient } from "@/lib/llm/client";
import type { Anchor } from "@/lib/schemas/anchor";
import type { EntityGraph } from "@/lib/schemas/llm";
import type { ResearchStateType, StoredFact } from "../state";

export type Update = Partial<ResearchStateType>;

export const MAX_QUERIES_PER_TRACK = 3;
export const MAX_FETCHES_PER_QUERY = 2;
/** Below this fact count the department is web-sparse; expansion goes wider. */
export const SPARSE_FACT_THRESHOLD = 15;

/** Pages shorter than this are login walls / JS shells; extracting is noise. */
const THIN_PAGE_CHARS = 200;

/** Pull the run-event emitter out of the graph config (noop when absent). */
export function emitterOf(config?: LangGraphRunnableConfig): EmitFn {
  const emit = config?.configurable?.emit as EmitFn | undefined;
  return emit ?? (() => undefined);
}

/** Relevance gate: pick which search results deserve a fetch (the scarcest budget). */
export async function selectRelevantUrls(opts: {
  llm: LlmClient;
  anchor: Anchor;
  entityGraph: EntityGraph | null | undefined;
  purpose: string;
  results: SearchResult[];
  max: number;
  scope: string;
  pushWarning: (w: Warning) => void;
}): Promise<string[]> {
  const { llm, anchor, entityGraph, purpose, results, max, scope, pushWarning } = opts;
  if (results.length === 0) return [];
  if (results.length === 1) return [results[0].url];
  const fallback = { urls: results.slice(0, max).map((r) => r.url) };
  const picked = await withDegrade(
    () =>
      llm.structured({
        task: "selectResults",
        system: SELECT_RESULTS_SYSTEM,
        prefix: anchorPacket(anchor, entityGraph),
        prompt: [
          `## Why we searched\n${purpose}`,
          "## Search results",
          ...results.map(
            (r, i) =>
              `${i + 1}. ${r.url}\n   title: ${r.title}\n   snippet: ${r.snippet.slice(0, 280)}`,
          ),
          `Pick up to ${max} URLs worth fetching.`,
        ].join("\n\n"),
        schema: selectedResultsSchema,
        effort: "low",
        maxTokens: 4000,
        context: { results, max },
      }),
    fallback,
    scope,
    pushWarning,
  );
  const known = new Set(results.map((r) => r.url));
  return picked.urls.filter((u) => known.has(u)).slice(0, max);
}

/**
 * Shared per-page pipeline for tracks and expansion: extract facts, store
 * the ones whose quotes verify, and give dropped quotes ONE repair pass
 * (models copying from tables often mangle the span; re-asking with the
 * failures listed recovers most of them).
 */
export async function extractAndStore(opts: {
  llm: LlmClient;
  state: ResearchStateType;
  page: FetchedPage;
  tier: number;
  sourceId: string;
  /** Track/lead-specific prompt lines placed between anchor and page. */
  contextLines: string[];
  scope: string;
  round: number;
  emit: EmitFn;
  pushWarning: (w: Warning) => void;
}): Promise<StoredFact[]> {
  const { llm, state, page, tier, sourceId, contextLines, scope, round, emit, pushWarning } =
    opts;
  if (page.markdown.length < THIN_PAGE_CHARS) {
    pushWarning({
      scope: `${scope}:thin`,
      message: `Skipped ${page.url}: page came back nearly empty (${page.markdown.length} chars), likely a login wall or JS-only page.`,
    });
    return [];
  }

  const promptFor = (extra: string[]) =>
    [
      ...contextLines,
      ...(tier >= 4 ? [TIER4_EXTRACT_NOTE] : []),
      ...extra,
      `## Page: ${page.url}`,
      extractionSlice(page.markdown, anchorTerms(state.anchor!)),
    ].join("\n\n");
  // Stable across every extraction call in the run: cached after the first.
  const prefix = anchorPacket(state.anchor!, state.entityGraph);

  const extraction = await withDegrade(
    () =>
      llm.structured({
        task: "extractFacts",
        system: EXTRACT_SYSTEM,
        prefix,
        prompt: promptFor([]),
        schema: extractedFactsSchema,
        context: { page, anchor: state.anchor },
      }),
    { facts: [] },
    `${scope}:extract`,
    pushWarning,
  );

  const { stored, droppedQuotes } = await storeExtractedFacts({
    runId: state.runId,
    placeId: state.placeId,
    sourceId,
    tier,
    pageMarkdown: page.markdown,
    extracted: extraction.facts,
    round,
  });
  const allStored = [...stored];

  if (droppedQuotes.length > 0) {
    const repair = await withDegrade(
      () =>
        llm.structured({
          task: "extractFacts",
          system: EXTRACT_SYSTEM,
          prefix,
          prompt: promptFor([
            QUOTE_REPAIR_NOTE,
            "## Dropped facts to repair (claim · failed quote)",
            ...droppedQuotes.map((f) => `- ${f.claim} · "${f.quote}"`),
          ]),
          schema: extractedFactsSchema,
          context: { page, anchor: state.anchor },
        }),
      { facts: [] },
      `${scope}:repair`,
      pushWarning,
    );
    const { stored: repaired, droppedQuotes: stillDropped } = await storeExtractedFacts({
      runId: state.runId,
      placeId: state.placeId,
      sourceId,
      tier,
      pageMarkdown: page.markdown,
      extracted: repair.facts,
      round,
    });
    allStored.push(...repaired);
    if (stillDropped.length > 0) {
      pushWarning({
        scope: `${scope}:verify-quote`,
        message: `${stillDropped.length} fact(s) dropped after repair: quote not found verbatim in ${page.url}`,
      });
    }
  }

  for (const fact of allStored) {
    emit({
      type: "fact_added",
      fact: {
        id: fact.id,
        category: fact.category,
        claim: fact.claim,
        quote: fact.quote,
        sourceId: fact.sourceId,
        tier: fact.tier,
        asOfDate: fact.asOfDate,
      },
    });
  }
  return allStored;
}
