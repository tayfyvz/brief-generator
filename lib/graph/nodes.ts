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
import { upsertDepartment } from "@/lib/db/queries";
import { briefContentSchema } from "@/lib/schemas/brief";
import {
  entityGraphSchema,
  extractedFactsSchema,
  llmBriefSchema,
  trackPlanSchema,
} from "@/lib/schemas/llm";
import type { FetchedPage, Warning } from "@/lib/schemas/tools";
import type { ResearchStateType, StoredFact } from "./state";

type Update = Partial<ResearchStateType>;

/** N0 — deterministic Places lookup; anchors every later prompt. */
export async function resolveAnchor(state: ResearchStateType): Promise<Update> {
  const anchor = await getPlacesClient().getDetails(state.placeId);
  if (!anchor) {
    throw new Error(`Place ID ${state.placeId} did not resolve to a place`);
  }
  await upsertDepartment(anchor);
  return { anchor };
}

/** N1 — the keystone: who operates this station and who buys the trucks? */
export async function resolveEntity(state: ResearchStateType): Promise<Update> {
  if (!state.anchor) throw new Error("resolveEntity requires an anchor");
  const anchor = state.anchor;
  const warnings: Warning[] = [];
  const search = getSearchClient();
  const fetch = getFetchClient();
  const llm = getLlmClient();

  const query = `who operates ${anchor.name} ${anchor.city ?? ""} ${anchor.state ?? ""} fire department`;
  const results = await withDegrade(
    () => search.search(query, { maxResults: 5 }),
    [],
    "entity:search",
    (w) => warnings.push(w),
  );

  const pages: FetchedPage[] = [];
  for (const result of results.slice(0, 2)) {
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
  return async function trackNode(state: ResearchStateType): Promise<Update> {
    if (!state.anchor) throw new Error(`track ${track.key} requires an anchor`);
    const anchor = state.anchor;
    const warnings: Warning[] = [];
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
      (w) => warnings.push(w),
    );

    const seenQueries = new Set(state.searchedQueries);
    const queries = plan.queries
      .filter((q) => !seenQueries.has(q))
      .slice(0, MAX_QUERIES_PER_TRACK);

    const visited = new Set(state.visitedUrls);
    const storedFacts: StoredFact[] = [];
    const newUrls: string[] = [];

    for (const query of queries) {
      const results = await withDegrade(
        () => search.search(query, { maxResults: 5 }),
        [],
        `track:${track.key}:search`,
        (w) => warnings.push(w),
      );
      const urls = results
        .map((r) => r.url)
        .filter((u) => !visited.has(u))
        .slice(0, MAX_FETCHES_PER_QUERY);

      for (const url of urls) {
        visited.add(url);
        newUrls.push(url);
        const page = await withDegrade(
          () => fetch.fetchPage(url),
          null,
          `track:${track.key}:fetch`,
          (w) => warnings.push(w),
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
          (w) => warnings.push(w),
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
        if (droppedQuotes > 0) {
          warnings.push({
            scope: `track:${track.key}:verify-quote`,
            message: `${droppedQuotes} fact(s) dropped: quote not found verbatim in ${page.url}`,
          });
        }
      }
    }

    return {
      facts: storedFacts,
      warnings,
      searchedQueries: queries,
      visitedUrls: newUrls,
    };
  };
}

/** N5 — verified facts only → persisted brief JSON. */
export async function synthesize(state: ResearchStateType): Promise<Update> {
  if (!state.anchor) throw new Error("synthesize requires an anchor");
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

  return { warnings };
}
