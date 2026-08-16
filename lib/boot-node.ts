/**
 * Node-only boot sequence, dynamically imported by instrumentation.ts.
 * This module (and everything it pulls in — pg, drizzle) is aliased to
 * `false` in the edge webpack compile; see next.config.ts.
 */
import { getEnv } from "@/lib/env";
import { runMigrations } from "@/lib/db/migrate";
import { markOrphanedRuns } from "@/lib/research/boot";

export async function boot(): Promise<void> {
  getEnv();
  await runMigrations();
  await markOrphanedRuns();
  console.log("[boot] env validated, migrations applied, orphaned runs marked");
}
