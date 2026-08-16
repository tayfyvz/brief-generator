import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { facts } from "@/lib/db/schema";
import type { ExtractedFact } from "@/lib/schemas/llm";
import type { StoredFact } from "@/lib/graph/state";

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Markdown-agnostic form: every non-alphanumeric run becomes one space.
 * Models copying "quotes" out of tables and links drop the pipes, brackets,
 * and asterisks; a punctuation-sensitive check threw away 22 roster facts in
 * one observed run. Token order still must match, so this stays verbatim in
 * spirit: the words must appear contiguously on the page.
 */
const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Models return partial dates ("2025", "2024-06") despite the schema asking
 * for yyyy-mm-dd. Normalize to a full ISO date (missing parts → 01) or null ; 
 * a bad date must never fail the insert and lose the fact.
 */
export function normalizeAsOfDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.trim().match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1900 || year > 2100) return null;
  const month = Number(m[2] ?? 1);
  const day = Number(m[3] ?? 1);
  if (month < 1 || month > 12) return null;
  // Reject impossible days (e.g. Feb 31) instead of letting Date roll over.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Containment check for verbatim quotes: exact (whitespace-insensitive)
 * first, then markup-insensitive token matching as the fallback.
 */
export function quoteAppearsIn(quote: string, markdown: string): boolean {
  const q = normalize(quote);
  if (q.length === 0) return false;
  if (normalize(markdown).includes(q)) return true;
  const qt = tokenize(quote);
  return qt.length > 0 && tokenize(markdown).includes(qt);
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
 * Persist extracted facts for one source page. Quotes must appear verbatim
 * in the snapshot or the fact is dropped. Tier-4 (community/enthusiast)
 * sources ARE citable: for tiny volunteer departments they are often the only
 * place the apparatus roster exists, and an honestly-labeled community fact
 * beats an empty section. Their facts are stored at low confidence, rendered
 * with an "unconfirmed" badge, and replaced by higher-tier facts whenever the
 * verifier finds the same datum from a better source.
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
        asOfDate: normalizeAsOfDate(f.asOfDate),
        discoveredRound: round,
        // Community sources never claim better than low confidence.
        confidence: tier >= 4 ? "low" : f.confidence,
        usefulness: f.usefulness,
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
      asOfDate: normalizeAsOfDate(f.asOfDate),
      tier,
      usefulness: f.usefulness,
    })),
    droppedQuotes,
  };
}
