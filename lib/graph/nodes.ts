import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { briefs, entities as entitiesTable } from "@/lib/db/schema";
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
import { hasBudget, recordCap, tryConsume } from "@/lib/research/budget";
import { getEnv } from "@/lib/env";
import { upsertDepartment } from "@/lib/db/queries";
import { briefContentSchema } from "@/lib/schemas/brief";
import {
  entityGraphSchema,
  expansionPlanSchema,
  extractedFactsSchema,
  llmBriefSchema,
  trackPlanSchema,
} from "@/lib/schemas/llm";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { EmitFn } from "@/lib/schemas/events";
import type { FetchedPage, Warning } from "@/lib/schemas/tools";
import type { ResearchStateType, StoredFact } from "./state";

type Update = Partial<ResearchStateType>;

/** Pull the run-event emitter out of the graph config (noop when absent). */
function emitterOf(config?: LangGraphRunnableConfig): EmitFn {
  const emit = config?.configurable?.emit as EmitFn | undefined;
  return emit ?? (() => undefined);
}

/** N0 — deterministic Places lookup; anchors every later prompt. */
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

/** N1 — the keystone: who operates this station and who buys the trucks? */
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

  const pages: FetchedPage[] = [];
  for (const result of results.slice(0, 2)) {
    if (!tryConsume(state.runId, "fetch")) break;
    const page = await withDegrade(
      () => fetch.fetchPage(result.url),
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

/** N2 — one research track: plan queries → search → fetch → extract facts. */
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
            "Return focused queries an analyst would run.",
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
      const urls = results
        .map((r) => r.url)
        .filter((u) => !visited.has(u))
        .slice(0, MAX_FETCHES_PER_QUERY);

      for (const url of urls) {
        if (!tryConsume(state.runId, "fetch")) {
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
              system:
                "You extract sales-relevant facts about ONE fire department from ONE page. " +
                "Every fact needs a claim plus a VERBATIM quote copied exactly from the page. " +
                "Skip anything about a different department than the anchor.",
              prompt: [
                anchorPacket(anchor, state.entityGraph),
                `## Track: ${track.title} — ${track.focus}`,
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
        message: "Run budget reached — track finished with what it had.",
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
    };
  };
}

const MAX_LEADS_PER_ROUND = 5;

/**
 * N3 ⟲ — expansion round: the planner turns discovered entities and facts
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

  const plan = await withDegrade(
    () =>
      llm.structured({
        task: "planExpansion",
        system:
          "You plan the next research round for a fire-department sales brief. " +
          "Turn discovered entities into leads: dealers → sibling delivery pages (kind 'similar'); " +
          "member towns → budget PDFs and council minutes; legislators → appropriations; " +
          "old apparatus → replacement-cycle queries. Then play completeness critic: " +
          "what would an AE ask that the facts still can't answer? Return no leads when " +
          "another round would not add sales-relevant facts.",
        prompt: [
          anchorPacket(anchor, state.entityGraph),
          SOURCE_PLAYBOOK,
          `## Round ${round} of ${getEnv().MAX_ROUNDS}`,
          "## Facts so far",
          ...state.facts.map((f) => `- [${f.category}] ${f.claim}`),
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

  for (const lead of leads) {
    if (!tryConsume(state.runId, "search")) break;
    newQueries.push(leadKey(lead.kind, lead.query));
    const results = await withDegrade(
      () =>
        lead.kind === "similar"
          ? similarity.findSimilar(lead.query, 5)
          : search.search(lead.query, { maxResults: 5 }),
      [],
      `expansion:${lead.kind}`,
      pushWarning,
    );
    const urls = results
      .map((r) => r.url)
      .filter((u) => !visited.has(u))
      .slice(0, MAX_FETCHES_PER_QUERY);

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
            system:
              "You extract sales-relevant facts about ONE fire department from ONE page. " +
              "Every fact needs a claim plus a VERBATIM quote copied exactly from the page. " +
              "Skip anything about a different department than the anchor.",
            prompt: [
              anchorPacket(anchor, state.entityGraph),
              `## Lead: ${lead.reason}`,
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
  };
}

function leadKey(kind: string, query: string): string {
  return kind === "similar" ? `similar:${query}` : query;
}

/** Loop control for N3: two dry rounds, round cap, or budget exhaustion. */
export function shouldContinueExpansion(
  state: ResearchStateType,
): "planExpansion" | "synthesize" {
  const env = getEnv();
  if (state.dryRounds >= 2) return "synthesize";
  if (state.round >= env.MAX_ROUNDS) {
    recordCap(state.runId, "max_rounds");
    return "synthesize";
  }
  // Budget exhausted mid-round: another round cannot search or fetch.
  if (!hasBudget(state.runId)) return "synthesize";
  return "planExpansion";
}

/** N5 — verified facts only → persisted brief JSON. */
export async function synthesize(
  state: ResearchStateType,
  config?: LangGraphRunnableConfig,
): Promise<Update> {
  if (!state.anchor) throw new Error("synthesize requires an anchor");
  const emit = emitterOf(config);
  emit({ type: "phase", phase: "synthesize", status: "start" });
  const warnings: Warning[] = [];
  const llm = getLlmClient();
  const factList = state.facts;

  const factContext = factList.map((f) => ({
    id: f.id,
    category: f.category,
    claim: f.claim,
    asOfDate: f.asOfDate,
    tags: f.tags,
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
                "Only reference fact IDs you were given. Rank 'why call today' by sales relevance and recency.",
              prompt: [
                anchorPacket(state.anchor!, state.entityGraph),
                "## Verified facts (id · category · claim · as-of)",
                ...factList.map(
                  (f) =>
                    `- ${f.id} · ${f.category} · ${f.claim}${f.asOfDate ? ` (as of ${f.asOfDate})` : ""}`,
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

  const content = briefContentSchema.parse({
    summary: llmBrief.summary,
    whyCallToday: llmBrief.whyCallToday
      .map((s) => ({ ...s, factIds: onlyKnown(s.factIds) }))
      .filter((s) => s.factIds.length > 0)
      .slice(0, 3),
    curatedFactIds: {
      leadership: onlyKnown(llmBrief.curated.leadership),
      fleet: onlyKnown(llmBrief.curated.fleet),
      money: onlyKnown(llmBrief.curated.money),
      news: onlyKnown(llmBrief.curated.news),
    },
    conflicts: llmBrief.conflicts.map((c) => ({
      ...c,
      factIds: onlyKnown(c.factIds),
    })),
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
