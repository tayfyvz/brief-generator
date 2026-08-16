import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { briefs, entities as entitiesTable, facts as factsTable } from "@/lib/db/schema";
import { isStale } from "@/lib/research/staleness";
import { getLlmClient } from "@/lib/llm/client";
import { anchorPacket } from "@/lib/llm/prompts/anchor";
import { SOURCE_PLAYBOOK } from "@/lib/llm/prompts/playbook";
import { saveSnapshot } from "@/lib/research/snapshots";
import { storeExtractedFacts } from "@/lib/research/facts";
import { tierForUrl } from "@/lib/research/tiering";
import { getFetchClient } from "@/lib/tools/firecrawl";
import { getPlacesClient } from "@/lib/tools/places";
import { withDegrade } from "@/lib/tools/retry";
import { getSearchClient } from "@/lib/tools/tavily";
import { getSimilarityClient } from "@/lib/tools/exa";
import {
  EXPANSION_FETCH_RESERVE,
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

/**
 * Relevance gate over search results (the fetch budget is the scarcest
 * resource): a cheap low-effort call picks which URLs deserve a fetch.
 * Observed failure mode without it: "Lexington" queries burning the whole
 * budget on Lexington KY/IL/TN pages and 200KB out-of-scope PDFs, leaving
 * zero fetches for the expansion round.
 */
const SELECT_RESULTS_SYSTEM = [
  "You triage web search results for a fire-department research pipeline.",
  "Pick ONLY the URLs genuinely worth fetching for the anchored department.",
  "Reject without mercy:",
  "results about similarly-named departments or places in a different city,",
  "county, or state than the anchor (check the URL domain and the snippet;",
  "a .gov domain of the wrong state or city is an automatic reject);",
  "bulk documents where the department would be one line among thousands",
  "(statewide budget archives, old appropriation lists, mutual-aid rosters);",
  "pages more than a decade old with no bearing on the current fleet or budget;",
  "generic advice, product marketing, or directory spam.",
  "Prefer: the department's own pages, its municipality/township/county,",
  "meeting minutes and budgets naming it, dealer/manufacturer delivery pages",
  "about it, local press about it, and its social media or wiki pages.",
  "Return the urls best-first; return an empty list when nothing qualifies.",
].join("\n");

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
        prompt: [
          anchorPacket(anchor, entityGraph),
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
}

const MAX_QUERIES_PER_TRACK = 3;
const MAX_FETCHES_PER_QUERY = 2;
/** Web-sparse departments get one extra fetch per query in expansion rounds. */
const SPARSE_FACT_THRESHOLD = 15;

/**
 * Shared system prompt for fact extraction (tracks and expansion). The rubric
 * is the relevance gate: it decides what an AE sees, so it errs toward
 * dropping trivia rather than keeping it.
 */
const EXTRACT_SYSTEM = [
  "You extract sales-relevant facts about ONE fire department from ONE page,",
  "for an account executive who sells fire apparatus. The AE is non-technical",
  "and has thirty seconds: extract FEW, high-value facts, never everything the",
  "page contains. Return at most 6 facts per page; fewer is better.",
  "Every fact needs a claim plus a VERBATIM quote: one contiguous span copied",
  "character-for-character from the page text. No paraphrasing, no stitching",
  "separate sentences together, no fixing typos. Facts with inexact quotes are dropped.",
  "If the page is about a similarly-named department in a different city, county,",
  "or state than the anchor, return an EMPTY facts list. Wrong-department",
  "contamination is worse than no facts.",
  "",
  "Extract ONLY what could matter on a sales call:",
  "current apparatus (unit, year, make, model, specs) and its age; planned or",
  "recent purchases, refurbishments, and retirements; open bids, RFPs, and dealer",
  "relationships; budgets, grants, loans, and fundraising capacity with amounts",
  "and dates; who runs the department and who signs purchases, with contact info",
  "beyond what the anchor already shows; recent news that gives a reason to call.",
  "",
  "Do NOT extract:",
  "the address, phone, or website already listed in the anchor;",
  "identity or directory confirmations (that the department exists, is located",
  "where the anchor says, or appears in a listing), record IDs, or observations",
  "about what a website contains or lacks;",
  "mission statements, mottos, or service descriptions;",
  "membership requirements, recruiting logistics, or training benefits;",
  "community event logistics (parades, Santa runs, holiday displays), unless the",
  "event demonstrably raises money, then extract the fundraising angle only;",
  "department history from before roughly 2012, unless that apparatus is still",
  "in service today or the history directly informs a replacement cycle;",
  "from county or municipal budget documents, lines that do not touch this",
  "department, its parent, volunteer company contributions, or apparatus capital;",
  "state or national program facts (grant program totals, application windows)",
  "not tied to this department: at most ONE such fact per page, usefulness low.",
  "",
  "One fact per underlying data point. If the page states the same thing in",
  "several places or several ways, extract it once with the best quote. Never",
  "return two facts that would tell the AE the same thing.",
  "",
  "Write each claim in DIRECT NOTE FORM, not a full sentence: 'Label: value'.",
  "Examples: 'Chief: John Smith (jsmith@dept.org, 555-1234)',",
  "'Engine 3: 2015 Pierce Enforcer pumper, 1500 GPM',",
  "'FY2025 fire budget: $180,000', 'Open bid: pumper replacement, due 2025-09-01'.",
  "Keep related data TOGETHER in one claim: a person's name, title, phone, and",
  "email belong in ONE claim, never split across facts; a truck's unit, year,",
  "make, model, and specs likewise. Keep claims under 15 words where possible.",
  "Use a short plain sentence only when note form would lose meaning (some news",
  "events). No interpretation or significance clauses (no 'which suggests',",
  "'indicating', 'showing that'); the AE draws conclusions, you report data.",
  "Never use em dashes or en dashes in any text you write.",
  "",
  "Set usefulness per fact: high = changes what the AE says on this call",
  "(current fleet and its age, money in motion, open bids, decision makers);",
  "medium = helpful background (buying process, staffing model, service area);",
  "low = context only. When in doubt between extracting a low-value fact and",
  "skipping it, skip it.",
].join("\n");

/**
 * Extra rubric for tier-4 (community/enthusiast) pages. These ARE citable;
 * for tiny volunteer departments the fandom wiki is often the only apparatus
 * roster in existence, and a labeled community fact beats an empty fleet
 * section. Facts land at low confidence with an "unconfirmed" badge, and the
 * expansion loop still tries to re-find each datum in a better source.
 */
const TIER4_EXTRACT_NOTE = [
  "NOTE: this page is a community or enthusiast source (wiki, social media,",
  "forum). Extract only concrete, checkable data: apparatus roster entries",
  "(unit number, year, make, model, specs), stations, named chiefs and",
  "officers, deliveries, retirements, fundraising drives. Skip rumors,",
  "speculation, and photo chatter. These facts render as unconfirmed",
  "community data, so precision matters more than coverage.",
].join("\n");

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
          prompt: [
            anchorPacket(anchor, state.entityGraph),
            SOURCE_PLAYBOOK,
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
    const queries = plan.queries
      .filter((q) => !seenQueries.has(q))
      .slice(0, MAX_QUERIES_PER_TRACK);

    const visited = new Set(state.visitedUrls);
    const storedFacts: StoredFact[] = [];
    const newUrls: string[] = [];
    const leadHints: string[] = [];

    let budgetExhausted = false;
    for (const query of queries) {
      if (!tryConsume(state.runId, "search")) {
        budgetExhausted = true;
        break;
      }
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
        results: results.filter((r) => !visited.has(r.url)),
        max: MAX_FETCHES_PER_QUERY,
        scope: `track:${track.key}:select`,
        pushWarning,
      });

      for (const url of urls) {
        if (!tryConsume(state.runId, "fetch", EXPANSION_FETCH_RESERVE)) {
          budgetExhausted = true;
          break;
        }
        visited.add(url);
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

        const extraction = await withDegrade(
          () =>
            llm.structured({
              task: "extractFacts",
              system: EXTRACT_SYSTEM,
              prompt: [
                anchorPacket(anchor, state.entityGraph),
                `## Track: ${track.title}: ${track.focus}`,
                ...(tier >= 4 ? [TIER4_EXTRACT_NOTE] : []),
                `## Page: ${page.url}`,
                page.markdown.slice(0, 12000),
              ].join("\n\n"),
              schema: extractedFactsSchema,
              context: { page, anchor },
            }),
          { facts: [] },
          `track:${track.key}:extract`,
          pushWarning,
        );

        const { stored, droppedQuotes } = await storeExtractedFacts({
          runId: state.runId,
          placeId: state.placeId,
          sourceId,
          tier,
          pageMarkdown: page.markdown,
          extracted: extraction.facts,
          round: state.round,
        });
        storedFacts.push(...stored);
        // Community-sourced data doubles as leads: the expansion round tries
        // to re-find each datum in an official or press source, which then
        // supersedes the tier-4 fact at verify time.
        if (tier >= 4) leadHints.push(...stored.map((f) => f.claim));
        for (const fact of stored) {
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
        if (droppedQuotes > 0) {
          pushWarning({
            scope: `track:${track.key}:verify-quote`,
            message: `${droppedQuotes} fact(s) dropped: quote not found verbatim in ${page.url}`,
          });
        }
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
        prompt: [
          anchorPacket(anchor, state.entityGraph),
          SOURCE_PLAYBOOK,
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
  const visited = new Set(state.visitedUrls);
  const leads = plan.leads
    .filter((lead) => !seenQueries.has(leadKey(lead.kind, lead.query)))
    .slice(0, MAX_LEADS_PER_ROUND);

  const storedFacts: StoredFact[] = [];
  const newQueries: string[] = [];
  const newUrls: string[] = [];
  const leadHints: string[] = [];
  const maxFetches = sparse ? MAX_FETCHES_PER_QUERY + 1 : MAX_FETCHES_PER_QUERY;

  for (const lead of leads) {
    if (!tryConsume(state.runId, "search")) break;
    newQueries.push(leadKey(lead.kind, lead.query));
    // A "similar" lead must carry a real URL; planners sometimes hand back
    // prose; route those through semantic search instead of erroring.
    const isUrl = (s: string) => {
      try {
        return Boolean(new URL(s));
      } catch {
        return false;
      }
    };
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
      results: results.filter((r) => !visited.has(r.url)),
      max: maxFetches,
      scope: "expansion:select",
      pushWarning,
    });

    for (const url of urls) {
      if (!tryConsume(state.runId, "fetch")) break;
      visited.add(url);
      newUrls.push(url);
      const page = await withDegrade(
        () => fetch.fetchPage(url),
        null,
        "expansion:fetch",
        pushWarning,
      );
      if (!page) continue;

      const tier = tierForUrl(url, officialDomains);
      const { sourceId } = await saveSnapshot(state.runId, page, tier);

      const extraction = await withDegrade(
        () =>
          llm.structured({
            task: "extractFacts",
            system: EXTRACT_SYSTEM,
            prompt: [
              anchorPacket(anchor, state.entityGraph),
              `## Lead: ${lead.reason}`,
              ...(tier >= 4 ? [TIER4_EXTRACT_NOTE] : []),
              `## Page: ${page.url}`,
              page.markdown.slice(0, 12000),
            ].join("\n\n"),
            schema: extractedFactsSchema,
            context: { page, anchor },
          }),
        { facts: [] },
        "expansion:extract",
        pushWarning,
      );

      const { stored } = await storeExtractedFacts({
        runId: state.runId,
        placeId: state.placeId,
        sourceId,
        tier,
        pageMarkdown: page.markdown,
        extracted: extraction.facts,
        round,
      });
      storedFacts.push(...stored);
      if (tier >= 4) leadHints.push(...stored.map((f) => f.claim));
      for (const fact of stored) {
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
    }
  }

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
        system:
          "You are a fresh-context verifier for a fire-department sales brief. " +
          "Three jobs, in order. " +
          "1) For each fact, judge ONLY whether the verbatim quote supports the claim " +
          "for the anchored department ('supported' / 'unsupported'). Also mark " +
          "'unsupported' any fact that carries no sales value at all: identity or " +
          "directory confirmations, record IDs, notes about what a website lacks. " +
          "2) Group DUPLICATES aggressively, across categories. Two facts are " +
          "duplicates whenever a reader learns nothing new from the second one: " +
          "identical statements, rewordings, the same datum from different sources, " +
          "or one fact whose information is fully contained in a more complete fact " +
          "(a subset is a duplicate of its superset). Keep the single best fact per " +
          "group (the claim that packs the most related data together, e.g. a person " +
          "with their contact info in one claim, then highest tier, then most recent) " +
          "as keepFactId and drop ALL the rest. The brief must never show the same " +
          "information twice. Restatements are duplicates, never conflicts. " +
          "3) List genuine CONFLICTS: facts that cannot all be true (two different " +
          "chiefs, two different years for the same unit). Resolve each by source tier " +
          "(T1 beats T3) then recency, name the winner in the note, and never silently " +
          "drop a side. Keep every note you write under 15 words, direct and plain. " +
          "If a group of facts agrees, it is not a conflict. " +
          "Tier-4 facts come from community sources (wikis, social media): when a " +
          "tier 1-3 fact carries the same datum, the tier-4 fact is the duplicate to " +
          "drop; when a tier-4 fact stands alone it survives at low confidence. " +
          "Never use em dashes in any text you write.",
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
    await db
      .update(factsTable)
      .set({ verification: "rejected" })
      .where(inArray(factsTable.id, applied.rejectedIds));
    pushWarning({
      scope: "verify",
      message: `${applied.rejectedIds.length} fact(s) failed verification and were dropped from the brief.`,
    });
  }
  if (applied.duplicateIds.length > 0) {
    await db
      .update(factsTable)
      .set({ verification: "duplicate" })
      .where(inArray(factsTable.id, applied.duplicateIds));
  }
  if (applied.conflictedIds.length > 0) {
    await db
      .update(factsTable)
      .set({ verification: "conflicted" })
      .where(inArray(factsTable.id, applied.conflictedIds));
  }
  if (applied.verifiedIds.length > 0) {
    await db
      .update(factsTable)
      .set({ verification: "verified" })
      .where(inArray(factsTable.id, applied.verifiedIds));
  }
  if (staleIds.length > 0) {
    await db
      .update(factsTable)
      .set({ stale: true })
      .where(inArray(factsTable.id, staleIds));
  }

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
              system:
                "You write a one-page sales brief for a fire-apparatus account executive from verified, cited facts. " +
                "The AE is non-technical and has thirty seconds; the whole brief must be readable in a few glances. " +
                "Be DIRECT everywhere: no filler words, no full sentences where a fragment carries the datum. " +
                "Only reference fact IDs you were given. Rank 'why call today' by sales relevance and recency. " +
                "Signal headlines are telegraphic, under 10 words, concrete and actionable: dated events, " +
                "dollar amounts, aging apparatus, awarded grants, open bids, leadership changes " +
                "('$120,000 AFG grant awarded Mar 2025', not a sentence about it). " +
                "Include a signal detail ONLY when it adds information the headline lacks, one short line max. " +
                "Never write generic headlines like 'active community engagement'; if nothing concrete exists, " +
                "return fewer signals and note the gap in caveats instead. " +
                "NO REPETITION anywhere: each piece of information appears exactly once in the brief. " +
                "The summary must not restate the signals or the curated facts; a signal must not restate " +
                "another signal; caveats must not restate anything above them. " +
                "Curation rules: each section takes ONLY facts of its own category " +
                "(leadership section: leadership facts; fleet: fleet; money: procurement and funding; news: news). " +
                "Never pad a section with facts from another category; an empty section is honest and correct, " +
                "and the gap belongs in caveats instead. Pick at most 5 facts per section, highest usefulness " +
                "first, and use each fact ID in at most one section. " +
                "Summary: at most 2 short sentences of orientation (who they are, the one thing that matters now). " +
                "Caveats: one short line each, only for gaps that change how the AE approaches the call. " +
                "Never use em dashes or en dashes anywhere in the brief.",
              prompt: [
                anchorPacket(state.anchor!, state.entityGraph),
                "## Verified facts (id · category · usefulness · claim · as-of)",
                ...factList.map(
                  (f) =>
                    `- ${f.id} · ${f.category} · ${f.usefulness ?? "medium"} · ${f.claim}${f.asOfDate ? ` (as of ${f.asOfDate})` : ""}`,
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

  // Never surface fact IDs the model invented.
  const knownIds = new Set(factList.map((f) => f.id));
  const onlyKnown = (ids: string[]) => ids.filter((id) => knownIds.has(id));

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
