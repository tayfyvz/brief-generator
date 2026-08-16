import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { facts } from "@/lib/db/schema";
import type { ExtractedFact } from "@/lib/schemas/llm";
import type { StoredFact } from "@/lib/graph/state";

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Whitespace-insensitive containment check for verbatim quotes. */
export function quoteAppearsIn(quote: string, markdown: string): boolean {
  const q = normalize(quote);
  return q.length > 0 && normalize(markdown).includes(q);
}

/**
 * Per-run registry of stored quotes. Parallel tracks extract from the same
 * pages and cannot see each other's state mid-superstep, so cross-track fact
 * dedupe happens here: one verbatim quote → one stored fact per run.
 * Synchronous check-and-claim keeps it race-free in a single process.
 */
const runQuoteRegistry = new Map<string, Set<string>>();

function quoteSetFor(runId: string): Set<string> {
  let set = runQuoteRegistry.get(runId);
  if (!set) {
    set = new Set();
    runQuoteRegistry.set(runId, set);
    // Seed from DB in the background (matters when resuming a run).
    void getDb()
      .select({ quote: facts.quote })
      .from(facts)
      .where(eq(facts.runId, runId))
      .then((rows) => rows.forEach((r) => set!.add(normalize(r.quote))))
      .catch(() => undefined);
  }
  return set;
}

/** Free the registry once a run finishes. */
export function releaseRunQuotes(runId: string): void {
  runQuoteRegistry.delete(runId);
}

/**
 * Persist extracted facts for one source page. Enforces the hard rules:
 * quotes must appear verbatim in the snapshot, and tier-4 sources never
 * become citations (their facts are dropped; they act as leads only).
 * Returns stored facts plus how many were dropped for a missing quote.
 */
export async function storeExtractedFacts(opts: {
  runId: string;
  placeId: string;
  sourceId: string;
  tier: number;
  pageMarkdown: string;
  extracted: ExtractedFact[];
  round: number;
}): Promise<{ stored: StoredFact[]; droppedQuotes: number }> {
  const { runId, placeId, sourceId, tier, pageMarkdown, extracted, round } = opts;
  if (tier >= 4) return { stored: [], droppedQuotes: 0 };

  const withQuotes = extracted.filter((f) => quoteAppearsIn(f.quote, pageMarkdown));
  const droppedQuotes = extracted.length - withQuotes.length;

  // Synchronous claim: drop quotes another track already stored this run.
  const seen = quoteSetFor(runId);
  const valid = withQuotes.filter((f) => {
    const key = normalize(f.quote);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (valid.length === 0) return { stored: [], droppedQuotes };

  const inserted = await getDb()
    .insert(facts)
    .values(
      valid.map((f) => ({
        runId,
        placeId,
        sourceId,
        category: f.category,
        tags: f.tags,
        claim: f.claim,
        quote: f.quote,
        asOfDate: f.asOfDate,
        discoveredRound: round,
        confidence: f.confidence,
        verification: "unverified",
      })),
    )
    .returning({ id: facts.id });

  return {
    stored: valid.map((f, i) => ({
      id: inserted[i].id,
      sourceId,
      category: f.category,
      tags: f.tags,
      claim: f.claim,
      quote: f.quote,
      asOfDate: f.asOfDate,
      tier,
    })),
    droppedQuotes,
  };
}
