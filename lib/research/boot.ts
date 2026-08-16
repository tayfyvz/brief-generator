import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { researchRuns } from "@/lib/db/schema";

/**
 * Crash safety: on boot, any run still marked running/queued was
 * orphaned by a previous process; mark it interrupted so it can be resumed
 * from its checkpoint via the Refresh button.
 */
export async function markOrphanedRuns(): Promise<void> {
  await getDb()
    .update(researchRuns)
    .set({ status: "interrupted" })
    .where(inArray(researchRuns.status, ["running", "queued"]));
}
