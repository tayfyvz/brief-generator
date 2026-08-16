import { getDb } from "@/lib/db/client";
import { briefs } from "@/lib/db/schema";
import { getLlmClient } from "@/lib/llm/client";
import { anchorPacket } from "@/lib/llm/prompts/anchor";
import { SYNTHESIZE_SYSTEM } from "@/lib/llm/prompts/synthesize";
import { withDegrade } from "@/lib/tools/retry";
import { briefContentSchema } from "@/lib/schemas/brief";
import { llmBriefSchema } from "@/lib/schemas/llm";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Warning } from "@/lib/schemas/tools";
import type { ResearchStateType } from "../state";
import { emitterOf, type Update } from "./shared";

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
