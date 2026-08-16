import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { facts, researchRuns, sources } from "@/lib/db/schema";
import type { StoredFact } from "@/lib/graph/state";
import type { FactCategory } from "@/lib/schemas/fact";

export interface CarriedFacts {
  facts: StoredFact[];
  /** URLs already covered by the prior run; skip re-fetching them. */
  urls: string[];
  fromRunId: string | null;
}

const NOTHING: CarriedFacts = { facts: [], urls: [], fromRunId: null };

/**
 * Copy the previous run's kept facts into a new run so coverage is
 * monotonic across reruns: the LLM query planner is nondeterministic, and
 * without this a rerun can silently lose a fact the AE saw yesterday
 * (observed: one run found a $658k ARPA appropriation, the next did not).
 *
 * Copies point at the ORIGINAL source rows (source snapshots are immutable
 * and keep their quotes verifiable) and re-enter this run's verify pass
 * unverified, so fresh findings still dedupe, conflict with, and supersede
 * them; staleness flags and dated-beats-undated rules age them out.
 */
export async function carryForwardFacts(
  runId: string,
  placeId: string,
): Promise<CarriedFacts> {
  const db = getDb();
  const [prior] = await db
    .select({ id: researchRuns.id })
    .from(researchRuns)
    .where(
      and(
        eq(researchRuns.placeId, placeId),
        eq(researchRuns.status, "done"),
        ne(researchRuns.id, runId),
      ),
    )
    .orderBy(desc(researchRuns.startedAt))
    .limit(1);
  if (!prior) return NOTHING;

  const kept = await db
    .select({
      sourceId: facts.sourceId,
      category: facts.category,
      tags: facts.tags,
      claim: facts.claim,
      quote: facts.quote,
      asOfDate: facts.asOfDate,
      confidence: facts.confidence,
      usefulness: facts.usefulness,
      tier: sources.tier,
      url: sources.url,
    })
    .from(facts)
    .innerJoin(sources, eq(sources.id, facts.sourceId))
    .where(
      and(
        eq(facts.runId, prior.id),
        inArray(facts.verification, ["verified", "conflicted"]),
      ),
    );
  if (kept.length === 0) return NOTHING;

  const inserted = await db
    .insert(facts)
    .values(
      kept.map((f) => ({
        runId,
        placeId,
        sourceId: f.sourceId,
        category: f.category,
        tags: f.tags,
        claim: f.claim,
        quote: f.quote,
        asOfDate: f.asOfDate,
        discoveredRound: 0,
        confidence: f.confidence,
        usefulness: f.usefulness,
        verification: "unverified",
        attributes: { carriedFromRun: prior.id },
      })),
    )
    .returning({ id: facts.id });

  const urls = [...new Set(kept.map((f) => f.url))];
  return {
    facts: kept.map((f, i) => ({
      id: inserted[i].id,
      sourceId: f.sourceId,
      category: f.category as FactCategory,
      tags: f.tags,
      claim: f.claim,
      quote: f.quote,
      asOfDate: f.asOfDate,
      tier: f.tier ?? 3,
      usefulness: f.usefulness,
    })),
    urls,
    fromRunId: prior.id,
  };
}
