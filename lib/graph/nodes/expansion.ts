import { getLlmClient } from "@/lib/llm/client";
import { anchorPacket } from "@/lib/llm/prompts/anchor";
import { SOURCE_PLAYBOOK } from "@/lib/llm/prompts/playbook";
import { PLAN_EXPANSION_SYSTEM } from "@/lib/llm/prompts/plan";
import { saveSnapshot } from "@/lib/research/snapshots";
import { tierForUrl } from "@/lib/research/tiering";
import { getFetchClient } from "@/lib/tools/firecrawl";
import { withDegrade } from "@/lib/tools/retry";
import { getSearchClient } from "@/lib/tools/tavily";
import { getSimilarityClient } from "@/lib/tools/exa";
import {
  canonicalUrl,
  claimUrl,
  hasBudget,
  recordCap,
  tryConsume,
} from "@/lib/research/budget";
import { getEnv } from "@/lib/env";
import { expansionPlanSchema } from "@/lib/schemas/llm";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Warning } from "@/lib/schemas/tools";
import type { ResearchStateType, StoredFact } from "../state";
import {
  MAX_FETCHES_PER_QUERY,
  SPARSE_FACT_THRESHOLD,
  emitterOf,
  extractAndStore,
  selectRelevantUrls,
  type Update,
} from "./shared";

const MAX_LEADS_PER_ROUND = 5;

function leadKey(kind: string, query: string): string {
  return kind === "similar" ? `similar:${query}` : query;
}

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
        system: PLAN_EXPANSION_SYSTEM,
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

  // Leads are independent: run them concurrently and merge afterwards. The
  // sync in-process budget counters and URL claim registry keep parallel
  // workers from double-spending or double-fetching.
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
