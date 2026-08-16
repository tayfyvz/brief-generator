import { describe, expect, it } from "vitest";
import { Pool } from "pg";

/**
 * The one graph integration test (PLAN §8): run the whole research graph
 * with stubbed tool clients against a real Postgres and assert the hard
 * rules hold; a brief exists, and every stored fact is cited with a
 * verbatim quote. Skips when no database is reachable (unit-only runs).
 */

// Tests get their own database so test departments never pollute the app's
// data (or its "Recent briefs" list). Created and migrated on first run.
const ADMIN_URL =
  process.env.DATABASE_URL ?? "postgres://brief:brief@localhost:5433/brief";
const TEST_DB = "brief_test";
process.env.DATABASE_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB}`);
// Force stubbed clients regardless of the local shell environment.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.TAVILY_API_KEY;
delete process.env.EXA_API_KEY;
delete process.env.FIRECRAWL_API_KEY;
delete process.env.GOOGLE_PLACES_API_KEY;

const PLACE_ID = "TestIntegrationPlace0001";

const dbAvailable = await (async () => {
  const admin = new Pool({
    connectionString: ADMIN_URL,
    connectionTimeoutMillis: 2_000,
  });
  try {
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DB],
    );
    if (rowCount === 0) await admin.query(`CREATE DATABASE ${TEST_DB}`);
  } catch {
    return false;
  } finally {
    await admin.end().catch(() => undefined);
  }
  try {
    const { runMigrations } = await import("@/lib/db/migrate");
    await runMigrations();
    return true;
  } catch {
    return false;
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

      // Hard rule: no source, no fact; and quotes are never empty.
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
