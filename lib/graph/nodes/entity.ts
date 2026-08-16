import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { entities as entitiesTable } from "@/lib/db/schema";
import { getLlmClient } from "@/lib/llm/client";
import { anchorPacket } from "@/lib/llm/prompts/anchor";
import { ENTITY_SYSTEM } from "@/lib/llm/prompts/entity";
import { saveSnapshot } from "@/lib/research/snapshots";
import { tierForUrl } from "@/lib/research/tiering";
import { getFetchClient } from "@/lib/tools/firecrawl";
import { withDegrade } from "@/lib/tools/retry";
import { getSearchClient } from "@/lib/tools/tavily";
import { EXPANSION_FETCH_RESERVE, tryConsume } from "@/lib/research/budget";
import { entityGraphSchema } from "@/lib/schemas/llm";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { FetchedPage, Warning } from "@/lib/schemas/tools";
import type { ResearchStateType } from "../state";
import { emitterOf, selectRelevantUrls, type Update } from "./shared";

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
    system: ENTITY_SYSTEM,
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
