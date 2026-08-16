/**
 * Re-run ONLY the synthesize node against facts already stored for a
 * department's latest run. Lets us iterate on the synthesis prompt without
 * spending search/fetch budget on a full research run.
 * Usage: node --env-file=.env --import tsx scripts/resynthesize.ts [<placeId>]
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  briefs,
  departments,
  facts,
  researchRuns,
  sources,
} from "@/lib/db/schema";
import { synthesize } from "@/lib/graph/nodes";
import { anchorSchema } from "@/lib/schemas/anchor";
import { briefContentSchema } from "@/lib/schemas/brief";
import type { ResearchStateType, StoredFact } from "@/lib/graph/state";

const placeId = process.argv[2] ?? "ChIJvfrKDp_Ua4gR5CHnUz3MbvE"; // Lexington IN

async function main() {
  const db = getDb();
  const [dept] = await db
    .select()
    .from(departments)
    .where(eq(departments.placeId, placeId))
    .limit(1);
  if (!dept?.anchor) throw new Error(`no department stored for ${placeId}`);
  const anchor = anchorSchema.parse(dept.anchor);

  const [run] = await db
    .select()
    .from(researchRuns)
    .where(eq(researchRuns.placeId, placeId))
    .orderBy(desc(researchRuns.startedAt))
    .limit(1);
  if (!run) throw new Error(`no research run for ${placeId}`);

  const factRows = await db
    .select({ f: facts, tier: sources.tier })
    .from(facts)
    .innerJoin(sources, eq(facts.sourceId, sources.id))
    .where(eq(facts.runId, run.id));
  const surviving: StoredFact[] = factRows
    .filter(
      ({ f }) => f.verification !== "rejected" && f.verification !== "duplicate",
    )
    .map(({ f, tier }) => ({
      id: f.id,
      sourceId: f.sourceId,
      category: f.category as StoredFact["category"],
      tags: f.tags,
      claim: f.claim,
      detail: f.detail,
      quote: f.quote,
      asOfDate: f.asOfDate,
      tier: tier ?? 3,
      usefulness: f.usefulness,
    }));
  console.log(`run ${run.id}: ${surviving.length} surviving facts`);

  // Verify-detected conflicts are not persisted as state; carry over the
  // conflicts from the previous brief so they are not silently dropped.
  const [briefRow] = await db
    .select()
    .from(briefs)
    .where(eq(briefs.placeId, placeId))
    .limit(1);
  const priorConflicts = briefRow
    ? briefContentSchema.parse(briefRow.content).conflicts
    : [];

  const state: ResearchStateType = {
    runId: run.id,
    placeId,
    anchor,
    entityGraph: null,
    facts: surviving,
    verifiedFacts: surviving,
    conflicts: priorConflicts,
    warnings: [],
    searchedQueries: [],
    visitedUrls: [],
    leadHints: [],
    round: run.roundCount,
    dryRounds: 0,
  };

  await synthesize(state);

  const [updated] = await db
    .select()
    .from(briefs)
    .where(eq(briefs.placeId, placeId))
    .limit(1);
  const content = briefContentSchema.parse(updated!.content);
  console.log(`\nsummary: ${content.summary}`);
  for (const s of content.whyCallToday) console.log(`why-call: ${s.headline}`);
  console.log(
    `curated: leadership=${content.curatedFactIds.leadership.length} fleet=${content.curatedFactIds.fleet.length} money=${content.curatedFactIds.money.length} news=${content.curatedFactIds.news.length}`,
  );
  for (const c of content.caveats) console.log(`caveat: ${c}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
