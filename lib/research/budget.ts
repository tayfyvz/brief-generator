import { getEnv } from "@/lib/env";

/**
 * Per-run hard caps (PLAN §2): searches/fetches are counted in-process
 * (parallel tracks can't see each other's graph state mid-superstep, so a
 * shared synchronous counter is the race-free way to enforce a run budget).
 * When a cap hits, the run finishes with whatever it has; visibly.
 */
interface RunBudget {
  searches: number;
  fetches: number;
  capsHit: Set<string>;
}

const budgets = new Map<string, RunBudget>();

function budgetFor(runId: string): RunBudget {
  let b = budgets.get(runId);
  if (!b) {
    b = { searches: 0, fetches: 0, capsHit: new Set() };
    budgets.set(runId, b);
  }
  return b;
}

/** Consume one unit of budget; false (and a recorded cap) when exhausted. */
export function tryConsume(runId: string, kind: "search" | "fetch"): boolean {
  const env = getEnv();
  const b = budgetFor(runId);
  const limit = kind === "search" ? env.MAX_SEARCHES_PER_RUN : env.MAX_FETCHES_PER_RUN;
  const used = kind === "search" ? b.searches : b.fetches;
  if (used >= limit) {
    b.capsHit.add(kind === "search" ? "max_searches" : "max_fetches");
    return false;
  }
  if (kind === "search") b.searches += 1;
  else b.fetches += 1;
  return true;
}

/** Non-mutating check: does the run still have search AND fetch budget? */
export function hasBudget(runId: string): boolean {
  const env = getEnv();
  const b = budgetFor(runId);
  return b.searches < env.MAX_SEARCHES_PER_RUN && b.fetches < env.MAX_FETCHES_PER_RUN;
}

export function recordCap(runId: string, cap: string): void {
  budgetFor(runId).capsHit.add(cap);
}

export function capsHitFor(runId: string): string[] {
  return [...budgetFor(runId).capsHit];
}

export function releaseBudget(runId: string): void {
  budgets.delete(runId);
}
