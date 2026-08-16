import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { facts as factsTable } from "@/lib/db/schema";
import { isStale } from "@/lib/research/staleness";
import { getLlmClient } from "@/lib/llm/client";
import { anchorPacket } from "@/lib/llm/prompts/anchor";
import { VERIFY_SYSTEM } from "@/lib/llm/prompts/verify";
import { withDegrade } from "@/lib/tools/retry";
import { verifyVerdictsSchema } from "@/lib/schemas/llm";
import { applyVerifyVerdicts } from "@/lib/research/verdicts";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Warning } from "@/lib/schemas/tools";
import type { ResearchStateType } from "../state";
import { emitterOf, type Update } from "./shared";

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
