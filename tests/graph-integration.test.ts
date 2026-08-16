import { describe, expect, it } from "vitest";
import { Pool } from "pg";

/**
 * The one graph integration test (PLAN §8): run the whole research graph
 * with stubbed tool clients against a real Postgres and assert the hard
 * rules hold — a brief exists, and every stored fact is cited with a
 * verbatim quote. Skips when no database is reachable (unit-only runs).
 */

process.env.DATABASE_URL ??= "postgres://brief:brief@localhost:5433/brief";
// Force stubbed clients regardless of the local shell environment.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TAVILY_API_KEY;
delete process.env.EXA_API_KEY;
delete process.env.FIRECRAWL_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;

const PLACE_ID = "TestIntegrationPlace0001";

const dbAvailable = await (async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 2_000,
  });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
})();

describe.skipIf(!dbAvailable)("research graph end-to-end (stubbed clients)", () => {
  it(
    "produces a persisted, fully-cited brief",
    async () => {
      const { executeResearchRun } = await import("@/lib/graph/run");
      const { getBriefPageData } = await import("@/lib/db/queries");
      const { briefContentSchema } = await import("@/lib/schemas/brief");

      const result = await executeResearchRun(PLACE_ID);
      expect(result.status).toBe("done");
      expect(result.factCount).toBeGreaterThan(0);

      const data = await getBriefPageData(PLACE_ID);
      expect(data?.brief).toBeTruthy();

      const content = briefContentSchema.parse(data!.brief!.content);
      expect(content.whyCallToday.length).toBeGreaterThan(0);

      // Hard rule: no source, no fact — and quotes are never empty.
      const sourceIds = new Set(data!.sources.map((s) => s.id));
      for (const fact of data!.facts) {
        expect(sourceIds.has(fact.sourceId)).toBe(true);
        expect(fact.quote.length).toBeGreaterThan(0);
        expect(fact.verification).not.toBe("rejected");
      }

      // Brief must only reference facts that exist.
      const factIds = new Set(data!.facts.map((f) => f.id));
      for (const signal of content.whyCallToday) {
        for (const id of signal.factIds) expect(factIds.has(id)).toBe(true);
      }
    },
    60_000,
  );
});
