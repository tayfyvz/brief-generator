/**
 * Run the research graph end-to-end on one Place ID from the CLI.
 * Usage: npm run graph:dev [-- <placeId>]
 * With no API keys configured, this exercises the full stubbed pipeline.
 */
import { executeResearchRun } from "@/lib/graph/run";
import { getBriefPageData } from "@/lib/db/queries";
import { briefContentSchema } from "@/lib/schemas/brief";

const placeId = process.argv[2] ?? "ChIJpcN7ecgAyIkRrOcWzZx3Yyc";

async function main() {
  console.log(`Running research for ${placeId}…`);
  const result = await executeResearchRun(placeId);
  console.log(`run ${result.runId}: ${result.status}, ${result.factCount} facts`);
  for (const w of result.warnings) console.log(`  warning [${w.scope}] ${w.message}`);
  if (result.error) console.log(`  error: ${result.error}`);

  const data = await getBriefPageData(placeId);
  if (data?.brief) {
    const content = briefContentSchema.parse(data.brief.content);
    console.log(`\nBrief for ${data.department.name}:`);
    console.log(`  summary: ${content.summary}`);
    for (const s of content.whyCallToday) console.log(`  why-call: ${s.headline}`);
    console.log(
      `  curated: leadership=${content.curatedFactIds.leadership?.length ?? 0} fleet=${content.curatedFactIds.fleet?.length ?? 0} money=${content.curatedFactIds.money?.length ?? 0} news=${content.curatedFactIds.news?.length ?? 0}`,
    );
    console.log(`  facts stored: ${data.facts.length}, sources: ${data.sources.length}`);
  } else {
    console.log("No brief persisted.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
