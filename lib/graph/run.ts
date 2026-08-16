import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { departments, researchRuns } from "@/lib/db/schema";
import { buildResearchGraph } from "./build";
import type { ResearchStateType } from "./state";

export interface RunResult {
  runId: string;
  status: "done" | "failed";
  factCount: number;
  warnings: ResearchStateType["warnings"];
  error?: string;
}

/**
 * Execute one research run end-to-end and manage the research_runs row.
 * The department row must exist before the run row (FK), so a stub row is
 * inserted first; N0 overwrites it with the real anchor.
 */
export async function executeResearchRun(placeId: string): Promise<RunResult> {
  const db = getDb();

  await db
    .insert(departments)
    .values({ placeId, name: "(resolving…)" })
    .onConflictDoNothing();

  const [run] = await db
    .insert(researchRuns)
    .values({ placeId, status: "running", startedAt: new Date() })
    .returning({ id: researchRuns.id });

  const graph = buildResearchGraph();
  try {
    const finalState = await graph.invoke({ runId: run.id, placeId });
    await db
      .update(researchRuns)
      .set({
        status: "done",
        finishedAt: new Date(),
        roundCount: finalState.round,
      })
      .where(eq(researchRuns.id, run.id));
    return {
      runId: run.id,
      status: "done",
      factCount: finalState.facts.length,
      warnings: finalState.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(researchRuns)
      .set({ status: "failed", finishedAt: new Date(), error: message })
      .where(eq(researchRuns.id, run.id));
    return {
      runId: run.id,
      status: "failed",
      factCount: 0,
      warnings: [],
      error: message,
    };
  }
}
