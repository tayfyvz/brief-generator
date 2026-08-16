import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { departments, researchRuns } from "@/lib/db/schema";
import { buildResearchGraph } from "./build";
import { getCheckpointer } from "./checkpointer";
import { releaseRunQuotes } from "@/lib/research/facts";
import { carryForwardFacts } from "@/lib/research/carryforward";
import { capsHitFor, claimUrl, releaseBudget } from "@/lib/research/budget";
import type { EmitFn } from "@/lib/schemas/events";
import type { ResearchStateType } from "./state";

export interface RunResult {
  runId: string;
  status: "done" | "failed";
  factCount: number;
  warnings: ResearchStateType["warnings"];
  error?: string;
}

/** Create the run row (and the department stub the FK requires). */
export async function createRunRow(placeId: string): Promise<string> {
  const db = getDb();
  await db
    .insert(departments)
    .values({ placeId, name: "(resolving…)" })
    .onConflictDoNothing();
  const [run] = await db
    .insert(researchRuns)
    .values({ placeId, status: "running", startedAt: new Date() })
    .returning({ id: researchRuns.id });
  return run.id;
}

/**
 * Execute (or resume) the research graph for an existing run row and manage
 * its status. Events flow through `emit`; the caller owns persistence of
 * events and any in-memory fan-out (RunManager).
 */
export async function executeGraph(opts: {
  runId: string;
  placeId: string;
  emit?: EmitFn;
  /** Resume an interrupted run from its checkpoint instead of starting fresh. */
  resume?: boolean;
  /** Skip carrying forward the previous run's facts (default: carry). */
  fresh?: boolean;
}): Promise<RunResult> {
  const { runId, placeId, resume, fresh } = opts;
  const emit: EmitFn = opts.emit ?? (() => undefined);
  const db = getDb();

  const checkpointer = await getCheckpointer();
  const graph = buildResearchGraph(checkpointer);
  const config = { configurable: { thread_id: runId, emit } };

  try {
    emit({ type: "run_started", placeId });

    // Reruns start from the previous run's kept facts so coverage only
    // grows; the carried facts re-enter verify alongside fresh findings.
    let carried: Awaited<ReturnType<typeof carryForwardFacts>> = {
      facts: [],
      urls: [],
      fromRunId: null,
    };
    if (!resume && !fresh) {
      carried = await carryForwardFacts(runId, placeId);
      for (const url of carried.urls) claimUrl(runId, url);
      for (const f of carried.facts) {
        emit({
          type: "fact_added",
          fact: {
            id: f.id,
            category: f.category,
            claim: f.claim,
            quote: f.quote,
            sourceId: f.sourceId,
            tier: f.tier,
            asOfDate: f.asOfDate,
          },
        });
      }
    }

    const finalState = (await graph.invoke(
      resume
        ? null
        : {
            runId,
            placeId,
            facts: carried.facts,
            visitedUrls: carried.urls,
          },
      config,
    )) as ResearchStateType;
    const capsHit = capsHitFor(runId);
    await db
      .update(researchRuns)
      .set({
        status: "done",
        finishedAt: new Date(),
        roundCount: finalState.round,
        capsHit,
      })
      .where(eq(researchRuns.id, runId));
    emit({
      type: "run_finished",
      status: "done",
      factCount: finalState.facts.length,
      capsHit,
    });
    return {
      runId,
      status: "done",
      factCount: finalState.facts.length,
      warnings: finalState.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(researchRuns)
      .set({ status: "failed", finishedAt: new Date(), error: message })
      .where(eq(researchRuns.id, runId));
    emit({
      type: "run_finished",
      status: "failed",
      factCount: 0,
      capsHit: [],
      error: message,
    });
    return { runId, status: "failed", factCount: 0, warnings: [], error: message };
  } finally {
    releaseRunQuotes(runId);
    releaseBudget(runId);
  }
}

/** One-shot convenience for scripts/tests: create the run row and execute. */
export async function executeResearchRun(placeId: string): Promise<RunResult> {
  const runId = await createRunRow(placeId);
  return executeGraph({ runId, placeId });
}
