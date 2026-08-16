import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { briefs, entities as entitiesTable, facts as factsTable } from "@/lib/db/schema";
import { isStale } from "@/lib/research/staleness";
import { getLlmClient } from "@/lib/llm/client";
import { anchorPacket } from "@/lib/llm/prompts/anchor";
import { SOURCE_PLAYBOOK } from "@/lib/llm/prompts/playbook";
import { SELECT_RESULTS_SYSTEM } from "@/lib/llm/prompts/select";
import {
  EXTRACT_SYSTEM,
  QUOTE_REPAIR_NOTE,
  TIER4_EXTRACT_NOTE,
} from "@/lib/llm/prompts/extract";
import { VERIFY_SYSTEM } from "@/lib/llm/prompts/verify";
import { SYNTHESIZE_SYSTEM } from "@/lib/llm/prompts/synthesize";
import { saveSnapshot } from "@/lib/research/snapshots";
import { storeExtractedFacts } from "@/lib/research/facts";
import { anchorTerms, extractionSlice } from "@/lib/research/markdown";
import { tierForUrl } from "@/lib/research/tiering";
import { getFetchClient } from "@/lib/tools/firecrawl";
import { getPlacesClient } from "@/lib/tools/places";
import { withDegrade } from "@/lib/tools/retry";
import { getSearchClient } from "@/lib/tools/tavily";
import { getSimilarityClient } from "@/lib/tools/exa";
import {
  EXPANSION_FETCH_RESERVE,
  canonicalUrl,
  claimUrl,
  hasBudget,
  recordCap,
  tryConsume,
} from "@/lib/research/budget";
import { getEnv } from "@/lib/env";
import { upsertDepartment } from "@/lib/db/queries";
import { briefContentSchema } from "@/lib/schemas/brief";
import {
  entityGraphSchema,
  expansionPlanSchema,
  extractedFactsSchema,
  llmBriefSchema,
  selectedResultsSchema,
  trackPlanSchema,
  verifyVerdictsSchema,
} from "@/lib/schemas/llm";
import { applyVerifyVerdicts } from "@/lib/research/verdicts";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { EmitFn } from "@/lib/schemas/events";
import type { FetchedPage, SearchResult, Warning } from "@/lib/schemas/tools";
import type { LlmClient } from "@/lib/llm/client";
import type { Anchor } from "@/lib/schemas/anchor";
import type { EntityGraph } from "@/lib/schemas/llm";
import type { ResearchStateType, StoredFact } from "./state";

type Update = Partial<ResearchStateType>;

/** Pull the run-event emitter out of the graph config (noop when absent). */
function emitterOf(config?: LangGraphRunnableConfig): EmitFn {
  const emit = config?.configurable?.emit as EmitFn | undefined;
  return emit ?? (() => undefined);
}

async function selectRelevantUrls(opts: {
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

/** N0; deterministic Places lookup; anchors every later prompt. */
export async function resolveAnchor(
  state: ResearchStateType,
  config?: LangGraphRunnableConfig,
): Promise<Update> {
  const emit = emitterOf(config);
  emit({ type: "phase", phase: "anchor", status: "start" });
  const anchor = await getPlacesClient().getDetails(state.placeId);
  if (!anchor) {
    throw new Error(`Place ID ${state.placeId} did not resolve to a place`);
  }
  await upsertDepartment(anchor);
  emit({ type: "phase", phase: "anchor", status: "done" });
  return { anchor };
}

/** N1; the keystone: who operates this station and who buys the trucks? */
export async function resolveEntity(
  state: ResearchStateType,
  config?: LangGraphRunnableConfig,
): Promise<Update> {
  if (!state.anchor) throw new Error("resolveEntity requires an anchor");
  const emit = emitterOf(config);
  emit({ type: "phase", phase: "entity", status: "start" });
  const anchor = state.anchor;
  const warnings: Warning[] = [];
  const search = getSearchClient();
  const fetch = getFetchClient();
  const llm = getLlmClient();

  const query = `who operates ${anchor.name} ${anchor.city ?? ""} ${anchor.state ?? ""} fire department`;
  const results = tryConsume(state.runId, "search")
    ? await withDegrade(
        () => search.search(query, { maxResults: 5 }),
        [],
        "entity:search",
        (w) => warnings.push(w),
      )
    : [];

  const entityUrls = await selectRelevantUrls({
    llm,
    anchor,
    entityGraph: null,
    purpose: query,
    results,
    max: 2,
    scope: "entity:select",
    pushWarning: (w) => warnings.push(w),
  });
  const pages: FetchedPage[] = [];
  for (const url of entityUrls) {
    if (!tryConsume(state.runId, "fetch", EXPANSION_FETCH_RESERVE)) break;
    const page = await withDegrade(
      () => fetch.fetchPage(url),
      null,
      "entity:fetch",
      (w) => warnings.push(w),
    );
    if (page) {
      pages.push(page);
      await saveSnapshot(state.runId, page, tierForUrl(page.url));
    }
  }

  const entityGraph = await llm.structured({
    task: "resolveEntity",
    system:
      "You resolve the operating and purchasing entities behind a fire station. " +
      "Answer strictly from the provided pages and anchor.",
    prompt: [
      anchorPacket(anchor),
      "## Fetched pages",
      ...pages.map((p) => `### ${p.url}\n${p.markdown.slice(0, 6000)}`),
      "",
      "Question: who operates this station, and which organization actually purchases its fire apparatus? " +
        "Return the entity graph (parent org, member municipalities, county, board, dealers) and the department's official web domains.",
    ].join("\n\n"),
    schema: entityGraphSchema,
    context: { anchor, pages },
  });

  const db = getDb();
  await db.delete(entitiesTable).where(eq(entitiesTable.placeId, state.placeId));
  if (entityGraph.entities.length > 0) {
    await db.insert(entitiesTable).values(
      entityGraph.entities.map((e) => ({
        placeId: state.placeId,
        kind: e.kind,
        name: e.name,
        attributes: { note: e.note, relations: e.relations ?? [] },
      })),
    );
  }

  for (const w of warnings) emit({ type: "warning", warning: w });
  emit({ type: "phase", phase: "entity", status: "done" });

  // Entity pages are NOT marked visited: tracks must still be able to
  // extract facts from them (snapshot storage dedupes the re-fetch).
  return {
    entityGraph,
    warnings,
    searchedQueries: [query],
  };
}

export interface TrackDef {
  key: string;
  title: string;
  focus: string;
  /**
   * Deterministic queries run before the LLM-planned ones. LLM query
   * planning varies run to run; a source type that reliably exists for
   * every department (IRS 990s, "<town> fire chief" press) should not
   * depend on the planner thinking of it this time.
   */
  seedQueries?: (anchor: Anchor) => string[];
}

const MAX_QUERIES_PER_TRACK = 3;
const MAX_FETCHES_PER_QUERY = 2;
/** Web-sparse departments get one extra fetch per query in expansion rounds. */
const SPARSE_FACT_THRESHOLD = 15;

/** Pages shorter than this are login walls / JS shells; extracting is noise. */
const THIN_PAGE_CHARS = 200;

/**
 * Shared per-page pipeline for tracks and expansion: extract facts, store
 * the ones whose quotes verify, and give dropped quotes ONE repair pass
 * (models copying from tables often mangle the span; re-asking with the
 * failures listed recovers most of them; observed loss without this: 22 of
 * 29 roster facts in a single run).
 */
async function extractAndStore(opts: {
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

/** N2; one research track: plan queries → search → fetch → extract facts. */
export function makeTrackNode(track: TrackDef) {
  return async function trackNode(
    state: ResearchStateType,
    config?: LangGraphRunnableConfig,
  ): Promise<Update> {
    if (!state.anchor) throw new Error(`track ${track.key} requires an anchor`);
    const emit = emitterOf(config);
    const anchor = state.anchor;
    const warnings: Warning[] = [];
    const pushWarning = (w: Warning) => {
      warnings.push(w);
      emit({ type: "warning", warning: w });
    };
    emit({
      type: "track_update",
      track: track.key,
      status: "running",
      searchCount: 0,
      factCount: 0,
    });
    const search = getSearchClient();
    const fetch = getFetchClient();
    const llm = getLlmClient();
    const orgName =
      state.entityGraph?.entities.find((e) => e.kind === "parent_org")?.name ??
      anchor.name;
    const officialDomains = state.entityGraph?.officialDomains ?? [];

    const plan = await withDegrade(
      () =>
        llm.structured({
          task: "planQueries",
          system:
            "You plan web searches for one research track of a fire-department sales brief. " +
            "Return focused queries an analyst would run. Every query MUST include the " +
            "department's city and state (add the county when useful); many US departments " +
            "share names, and an unqualified query surfaces the wrong one.",
          // Anchor + playbook are identical for all six parallel tracks:
          // one cache write, five reads.
          prefix: [anchorPacket(anchor, state.entityGraph), SOURCE_PLAYBOOK].join(
            "\n\n",
          ),
          prompt: [
            `## Track: ${track.title}`,
            track.focus,
            `Return up to ${MAX_QUERIES_PER_TRACK} search queries.`,
          ].join("\n\n"),
          schema: trackPlanSchema,
          context: { track: track.key, anchor, orgName },
        }),
      { queries: [] },
      `track:${track.key}:plan`,
      pushWarning,
    );

    const seenQueries = new Set(state.searchedQueries);
    const seeds = (track.seedQueries?.(anchor) ?? []).filter(
      (q) => !seenQueries.has(q),
    );
    const planned = plan.queries.filter(
      (q) => !seenQueries.has(q) && !seeds.includes(q),
    );
    const queries = [...seeds, ...planned].slice(
      0,
      MAX_QUERIES_PER_TRACK + seeds.length,
    );

    const visited = new Set(state.visitedUrls.map(canonicalUrl));
    const storedFacts: StoredFact[] = [];
    const newUrls: string[] = [];
    const leadHints: string[] = [];

    let budgetExhausted = false;
    for (const query of queries) {
      if (!tryConsume(state.runId, "search")) {
        budgetExhausted = true;
        break;
      }
      emit({
        type: "search",
        scope: `track:${track.key}`,
        query,
        seeded: seeds.includes(query),
      });
      const results = await withDegrade(
        () => search.search(query, { maxResults: 5 }),
        [],
        `track:${track.key}:search`,
        pushWarning,
      );
      const urls = await selectRelevantUrls({
        llm,
        anchor,
        entityGraph: state.entityGraph,
        purpose: `Track "${track.title}": ${query}`,
        results: results.filter((r) => !visited.has(canonicalUrl(r.url))),
        max: MAX_FETCHES_PER_QUERY,
        scope: `track:${track.key}:select`,
        pushWarning,
      });

      for (const url of urls) {
        // Parallel tracks surface the same URLs; first claimant fetches it.
        if (!claimUrl(state.runId, url)) continue;
        if (!tryConsume(state.runId, "fetch", EXPANSION_FETCH_RESERVE)) {
          budgetExhausted = true;
          break;
        }
        visited.add(canonicalUrl(url));
        newUrls.push(url);
        const page = await withDegrade(
          () => fetch.fetchPage(url),
          null,
          `track:${track.key}:fetch`,
          pushWarning,
        );
        if (!page) continue;

        const tier = tierForUrl(url, officialDomains);
        const { sourceId } = await saveSnapshot(state.runId, page, tier);
        const stored = await extractAndStore({
          llm,
          state,
          page,
          tier,
          sourceId,
          contextLines: [`## Track: ${track.title}: ${track.focus}`],
          scope: `track:${track.key}`,
          round: state.round,
          emit,
          pushWarning,
        });
        storedFacts.push(...stored);
        // Community-sourced data doubles as leads: the expansion round tries
        // to re-find each datum in an official or press source, which then
        // supersedes the tier-4 fact at verify time.
        if (tier >= 4) leadHints.push(...stored.map((f) => f.claim));
      }
      if (budgetExhausted) break;
    }

    if (budgetExhausted) {
      pushWarning({
        scope: `track:${track.key}:budget`,
        message: "Run budget reached; track finished with what it had.",
      });
    }
    emit({
      type: "track_update",
      track: track.key,
      status: "done",
      searchCount: queries.length,
      factCount: storedFacts.length,
    });

    return {
      facts: storedFacts,
      warnings,
      searchedQueries: queries,
      visitedUrls: newUrls,
      leadHints,
    };
  };
}

const MAX_LEADS_PER_ROUND = 5;

/**
 * N3 ⟲; expansion round: the planner turns discovered entities and facts
 * into new leads (keyword searches + Exa find-similar), executes them, and
 * extracts more facts. Loops until two dry rounds, the round cap, or the
 * run budget (see shouldContinueExpansion).
 */
export async function planExpansion(
  state: ResearchStateType,
  config?: LangGraphRunnableConfig,
): Promise<Update> {
  if (!state.anchor) throw new Error("planExpansion requires an anchor");
  const emit = emitterOf(config);
  const round = state.round + 1;
  emit({ type: "phase", phase: "expansion", status: "start", round });

  const anchor = state.anchor;
  const warnings: Warning[] = [];
  const pushWarning = (w: Warning) => {
    warnings.push(w);
    emit({ type: "warning", warning: w });
  };
  const llm = getLlmClient();
  const search = getSearchClient();
  const similarity = getSimilarityClient();
  const fetch = getFetchClient();
  const officialDomains = state.entityGraph?.officialDomains ?? [];

  const sparse = state.facts.length < SPARSE_FACT_THRESHOLD;
  const plan = await withDegrade(
    () =>
      llm.structured({
        task: "planExpansion",
        system:
          "You plan the next research round for a fire-department sales brief. " +
          "Turn discovered entities into leads: dealers into sibling delivery pages (kind 'similar'); " +
          "member towns into budget PDFs and council minutes; legislators into appropriations; " +
          "old apparatus into replacement-cycle queries; tier-4 hints into verification " +
          "queries against official and press sources. Then play completeness critic: " +
          "what would an AE ask that the facts still can't answer? Return no leads when " +
          "another round would not add sales-relevant facts.",
        prefix: [anchorPacket(anchor, state.entityGraph), SOURCE_PLAYBOOK].join(
          "\n\n",
        ),
        prompt: [
          `## Round ${round} of ${getEnv().MAX_ROUNDS}`,
          "## Facts so far",
          ...state.facts.map((f) => `- [${f.category}] ${f.claim}`),
          ...(state.leadHints.length > 0
            ? [
                "## Community-sourced data to upgrade (find the same datum in a tier 1-3 source)",
                ...state.leadHints.map((h) => `- ${h}`),
              ]
            : []),
          ...(sparse
            ? [
                "## Coverage note",
                `Only ${state.facts.length} facts so far: this department is web-sparse. ` +
                  "Go wider: county and township sites, town meeting minutes and budgets, " +
                  "the state fire marshal or firefighter association, the USFA registry, " +
                  "local newspapers, and the department's social media as lead sources.",
              ]
            : []),
          "## Queries already searched (do not repeat)",
          ...state.searchedQueries.map((q) => `- ${q}`),
        ].join("\n"),
        schema: expansionPlanSchema,
        context: { round, orgName: anchor.name },
      }),
    { leads: [], criticNote: "" },
    "expansion:plan",
    pushWarning,
  );

  const seenQueries = new Set(state.searchedQueries);
  const visited = new Set(state.visitedUrls.map(canonicalUrl));
  const leads = plan.leads
    .filter((lead) => !seenQueries.has(leadKey(lead.kind, lead.query)))
    .slice(0, MAX_LEADS_PER_ROUND);

  // The planner deciding another round would add nothing is a deliberate
  // stop signal, not a dry round to wait out.
  if (leads.length === 0) {
    emit({ type: "phase", phase: "expansion", status: "done", round });
    return { round, dryRounds: 2, warnings };
  }

  const maxFetches = sparse ? MAX_FETCHES_PER_QUERY + 1 : MAX_FETCHES_PER_QUERY;

  // A "similar" lead must carry a real URL; planners sometimes hand back
  // prose; route those through semantic search instead of erroring.
  const isUrl = (s: string) => {
    try {
      return Boolean(new URL(s));
    } catch {
      return false;
    }
  };

  // Leads are independent: run them concurrently and merge afterwards.
  // Wall-clock per round becomes the slowest lead instead of the sum; the
  // sync in-process budget counters and URL claim registry keep the
  // parallel workers from double-spending or double-fetching, and the
  // Firecrawl token bucket absorbs the burst.
  const processLead = async (lead: (typeof leads)[number]) => {
    const out = {
      query: null as string | null,
      urls: [] as string[],
      facts: [] as StoredFact[],
      hints: [] as string[],
    };
    if (!tryConsume(state.runId, "search")) return out;
    out.query = leadKey(lead.kind, lead.query);
    emit({
      type: "search",
      scope: `expansion:${lead.kind}`,
      query: lead.query,
      round,
    });
    const results = await withDegrade(
      () =>
        lead.kind === "similar" && isUrl(lead.query)
          ? similarity.findSimilar(lead.query, 5)
          : lead.kind === "similar"
            ? similarity.searchSemantic(lead.query, 5)
            : search.search(lead.query, { maxResults: 5 }),
      [],
      `expansion:${lead.kind}`,
      pushWarning,
    );
    const urls = await selectRelevantUrls({
      llm,
      anchor,
      entityGraph: state.entityGraph,
      purpose: `Expansion lead (${lead.kind}): ${lead.query}\nReason: ${lead.reason}`,
      results: results.filter((r) => !visited.has(canonicalUrl(r.url))),
      max: maxFetches,
      scope: "expansion:select",
      pushWarning,
    });

    for (const url of urls) {
      if (!claimUrl(state.runId, url)) continue;
      if (!tryConsume(state.runId, "fetch")) break;
      visited.add(canonicalUrl(url));
      out.urls.push(url);
      const page = await withDegrade(
        () => fetch.fetchPage(url),
        null,
        "expansion:fetch",
        pushWarning,
      );
      if (!page) continue;

      const tier = tierForUrl(url, officialDomains);
      const { sourceId } = await saveSnapshot(state.runId, page, tier);
      const stored = await extractAndStore({
        llm,
        state,
        page,
        tier,
        sourceId,
        contextLines: [`## Lead: ${lead.reason}`],
        scope: "expansion",
        round,
        emit,
        pushWarning,
      });
      out.facts.push(...stored);
      if (tier >= 4) out.hints.push(...stored.map((f) => f.claim));
    }
    return out;
  };

  const leadResults = await Promise.all(leads.map(processLead));
  const storedFacts = leadResults.flatMap((r) => r.facts);
  const newQueries = leadResults.flatMap((r) => (r.query ? [r.query] : []));
  const newUrls = leadResults.flatMap((r) => r.urls);
  const leadHints = leadResults.flatMap((r) => r.hints);

  emit({ type: "phase", phase: "expansion", status: "done", round });
  return {
    round,
    dryRounds: storedFacts.length === 0 ? state.dryRounds + 1 : 0,
    facts: storedFacts,
    warnings,
    searchedQueries: newQueries,
    visitedUrls: newUrls,
    leadHints,
  };
}

function leadKey(kind: string, query: string): string {
  return kind === "similar" ? `similar:${query}` : query;
}

/** Loop control for N3: two dry rounds, round cap, or budget exhaustion. */
export function shouldContinueExpansion(
  state: ResearchStateType,
): "planExpansion" | "verify" {
  const env = getEnv();
  if (state.dryRounds >= 2) return "verify";
  if (state.round >= env.MAX_ROUNDS) {
    recordCap(state.runId, "max_rounds");
    return "verify";
  }
  // Budget exhausted mid-round: another round cannot search or fetch.
  if (!hasBudget(state.runId)) return "verify";
  return "planExpansion";
}

/**
 * N4; fresh-context verifier: does the verbatim quote actually support the
 * claim for THIS department? Conflicts are resolved by tier + recency and
 * surfaced in the brief; unsupported facts are marked rejected and never
 * shown; facts older than ~18 months get a staleness flag.
 */
export async function verify(
  state: ResearchStateType,
  config?: LangGraphRunnableConfig,
): Promise<Update> {
  if (!state.anchor) throw new Error("verify requires an anchor");
  const anchor = state.anchor;
  const emit = emitterOf(config);
  emit({ type: "phase", phase: "verify", status: "start" });
  const factList = state.facts;
  if (factList.length === 0) {
    emit({ type: "phase", phase: "verify", status: "done" });
    return { verifiedFacts: [], conflicts: [] };
  }

  const warnings: Warning[] = [];
  const pushWarning = (w: Warning) => {
    warnings.push(w);
    emit({ type: "warning", warning: w });
  };
  const llm = getLlmClient();

  const verdicts = await withDegrade(
    () =>
      llm.structured({
        task: "verifyFacts",
        system: VERIFY_SYSTEM,
        prompt: [
          anchorPacket(anchor),
          "## Facts (id · tier · as-of · claim · quote)",
          ...factList.map(
            (f) =>
              `- ${f.id} · T${f.tier} · ${f.asOfDate ?? "undated"} · ${f.claim} · "${f.quote}"`,
          ),
        ].join("\n"),
        schema: verifyVerdictsSchema,
        // Verdict lists scale with fact count; a truncated response would
        // fail soft into "keep everything", losing the dedupe pass entirely.
        maxTokens: 32000,
        // The dedupe/conflict pass is where brief quality is won or lost.
        effort: "high",
        context: {
          facts: factList.map((f) => ({
            id: f.id,
            claim: f.claim,
            quote: f.quote,
            tier: f.tier,
            asOfDate: f.asOfDate,
          })),
        },
      }),
    // Fail soft: an unavailable verifier keeps facts (visibly) rather than
    // dropping everything.
    {
      verdicts: factList.map((f) => ({ factId: f.id, verdict: "supported" as const })),
      duplicates: [],
      conflicts: [],
    },
    "verify",
    pushWarning,
  );

  const applied = applyVerifyVerdicts(factList, verdicts);
  const now = new Date();
  const staleIds = factList.filter((f) => isStale(f.asOfDate, now)).map((f) => f.id);

  const db = getDb();
  if (applied.rejectedIds.length > 0) {
    pushWarning({
      scope: "verify",
      message: `${applied.rejectedIds.length} fact(s) failed verification and were dropped from the brief.`,
    });
  }
  // Disjoint id sets; run the status writes concurrently.
  const statusWrites: { ids: string[]; set: Partial<typeof factsTable.$inferInsert> }[] = [
    { ids: applied.rejectedIds, set: { verification: "rejected" } },
    { ids: applied.duplicateIds, set: { verification: "duplicate" } },
    { ids: applied.conflictedIds, set: { verification: "conflicted" } },
    { ids: applied.verifiedIds, set: { verification: "verified" } },
    { ids: staleIds, set: { stale: true } },
  ];
  await Promise.all(
    statusWrites
      .filter((w) => w.ids.length > 0)
      .map((w) => db.update(factsTable).set(w.set).where(inArray(factsTable.id, w.ids))),
  );

  emit({ type: "phase", phase: "verify", status: "done" });
  return {
    verifiedFacts: applied.surviving,
    conflicts: applied.conflicts,
    warnings,
  };
}

/** N5; verified facts only → persisted brief JSON. */
export async function synthesize(
  state: ResearchStateType,
  config?: LangGraphRunnableConfig,
): Promise<Update> {
  if (!state.anchor) throw new Error("synthesize requires an anchor");
  const emit = emitterOf(config);
  emit({ type: "phase", phase: "synthesize", status: "start" });
  const warnings: Warning[] = [];
  const llm = getLlmClient();
  // Verified facts only; fall back to raw facts if N4 was skipped.
  const factList = state.verifiedFacts ?? state.facts;

  const factContext = factList.map((f) => ({
    id: f.id,
    category: f.category,
    claim: f.claim,
    asOfDate: f.asOfDate,
    tags: f.tags,
    usefulness: f.usefulness,
  }));

  // Short aliases (F1, F2…) instead of raw UUIDs in the prompt: models
  // truncate long opaque IDs, which silently emptied signals and curation
  // when the invented-ID guard filtered the shortened forms out.
  const aliasOf = new Map(factList.map((f, i) => [f.id, `F${i + 1}`]));
  const idOfAlias = new Map(factList.map((f, i) => [`F${i + 1}`, f.id]));

  const emptyBrief = {
    summary:
      "Research completed but produced no verifiable, cited facts. Treat this brief as empty rather than authoritative.",
    whyCallToday: [],
    curated: { leadership: [], fleet: [], money: [], news: [] },
    conflicts: [],
    caveats: ["No cited facts survived verification for this run."],
  };

  const llmBrief =
    factList.length === 0
      ? emptyBrief
      : await withDegrade(
          () =>
            llm.structured({
              task: "synthesize",
              system: SYNTHESIZE_SYSTEM,
              prompt: [
                anchorPacket(state.anchor!, state.entityGraph),
                "## Verified facts (id · category · usefulness · claim · as-of)",
                ...factList.map(
                  (f) =>
                    `- ${aliasOf.get(f.id)} · ${f.category} · ${f.usefulness ?? "medium"} · ${f.claim}${f.asOfDate ? ` (as of ${f.asOfDate})` : ""}`,
                ),
                "",
                "Produce the brief: summary, top-3 'why call today' signals, curated fact ids per section, conflicts, honest caveats.",
              ].join("\n"),
              schema: llmBriefSchema,
              context: { facts: factContext },
            }),
          emptyBrief,
          "synthesize",
          (w) => warnings.push(w),
        );

  if (process.env.DEBUG_SYNTH) {
    console.log("RAW LLM BRIEF:", JSON.stringify(llmBrief, null, 2));
  }
  // Map aliases back to real IDs (raw IDs pass through untouched, so
  // verify-produced conflicts and the stub still work), then drop anything
  // the model invented.
  const knownIds = new Set(factList.map((f) => f.id));
  const onlyKnown = (ids: string[]) =>
    ids.map((id) => idOfAlias.get(id) ?? id).filter((id) => knownIds.has(id));

  // Code-enforced curation invariants (the prompt asks, this guarantees):
  // a section only holds facts of its own categories (no padding an empty
  // fleet section with staffing trivia), each fact renders in at most one
  // section, and sections stay short.
  const MAX_CURATED_PER_SECTION = 5;
  const SECTION_CATEGORIES: Record<
    "leadership" | "fleet" | "money" | "news",
    string[]
  > = {
    leadership: ["leadership"],
    fleet: ["fleet"],
    money: ["procurement", "funding"],
    news: ["news"],
  };
  const categoryById = new Map(factList.map((f) => [f.id, f.category]));
  const usedIds = new Set<string>();
  const curateSection = (key: keyof typeof SECTION_CATEGORIES) =>
    onlyKnown(llmBrief.curated[key])
      .filter((id) => SECTION_CATEGORIES[key].includes(categoryById.get(id) ?? ""))
      .filter((id) => !usedIds.has(id) && (usedIds.add(id), true))
      .slice(0, MAX_CURATED_PER_SECTION);

  const content = briefContentSchema.parse({
    summary: llmBrief.summary,
    whyCallToday: llmBrief.whyCallToday
      .map((s) => ({ ...s, factIds: onlyKnown(s.factIds) }))
      .filter((s) => s.factIds.length > 0)
      .slice(0, 3),
    curatedFactIds: {
      leadership: curateSection("leadership"),
      fleet: curateSection("fleet"),
      money: curateSection("money"),
      news: curateSection("news"),
    },
    conflicts: [
      // Conflicts detected by the verifier come first; the synthesis model
      // may add more, but never silently resolves either kind.
      ...state.conflicts.map((c) => ({ ...c, factIds: onlyKnown(c.factIds) })),
      ...llmBrief.conflicts.map((c) => ({ ...c, factIds: onlyKnown(c.factIds) })),
    ].filter((c) => c.factIds.length > 0),
    caveats: llmBrief.caveats,
    generatedAt: new Date().toISOString(),
  });

  const db = getDb();
  await db
    .insert(briefs)
    .values({ placeId: state.placeId, runId: state.runId, content })
    .onConflictDoUpdate({
      target: briefs.placeId,
      set: { runId: state.runId, content, createdAt: new Date() },
    });

  for (const w of warnings) emit({ type: "warning", warning: w });
  emit({ type: "phase", phase: "synthesize", status: "done" });
  return { warnings };
}
