import { getLlmClient } from "@/lib/llm/client";
import { anchorPacket } from "@/lib/llm/prompts/anchor";
import { SOURCE_PLAYBOOK } from "@/lib/llm/prompts/playbook";
import { PLAN_QUERIES_SYSTEM } from "@/lib/llm/prompts/plan";
import { saveSnapshot } from "@/lib/research/snapshots";
import { tierForUrl } from "@/lib/research/tiering";
import { getFetchClient } from "@/lib/tools/firecrawl";
import { withDegrade } from "@/lib/tools/retry";
import { getSearchClient } from "@/lib/tools/tavily";
import {
  EXPANSION_FETCH_RESERVE,
  canonicalUrl,
  claimUrl,
  tryConsume,
} from "@/lib/research/budget";
import { trackPlanSchema } from "@/lib/schemas/llm";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Warning } from "@/lib/schemas/tools";
import type { ResearchStateType, StoredFact } from "../state";
import type { TrackDef } from "../tracks";
import {
  MAX_FETCHES_PER_QUERY,
  MAX_QUERIES_PER_TRACK,
  emitterOf,
  extractAndStore,
  selectRelevantUrls,
  type Update,
} from "./shared";

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
          system: PLAN_QUERIES_SYSTEM,
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
