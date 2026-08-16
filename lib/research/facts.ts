import { getDb } from "@/lib/db/client";
import { facts } from "@/lib/db/schema";
import type { ExtractedFact } from "@/lib/schemas/llm";
import type { StoredFact } from "@/lib/graph/state";

/** Whitespace-insensitive containment check for verbatim quotes. */
export function quoteAppearsIn(quote: string, markdown: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const q = normalize(quote);
  return q.length > 0 && normalize(markdown).includes(q);
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

  const valid = extracted.filter((f) => quoteAppearsIn(f.quote, pageMarkdown));
  const droppedQuotes = extracted.length - valid.length;
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
