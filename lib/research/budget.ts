import { getEnv } from "@/lib/env";

/**
 * Per-run hard caps: searches/fetches are counted in-process
 * (parallel tracks can't see each other's graph state mid-superstep, so a
 * shared synchronous counter is the race-free way to enforce a run budget).
 * When a cap hits, the run finishes with whatever it has; visibly.
 */
interface RunBudget {
  searches: number;
  fetches: number;
  capsHit: Set<string>;
  claimedUrls: Set<string>;
}

const budgets = new Map<string, RunBudget>();

function budgetFor(runId: string): RunBudget {
  let b = budgets.get(runId);
  if (!b) {
    b = { searches: 0, fetches: 0, capsHit: new Set(), claimedUrls: new Set() };
    budgets.set(runId, b);
  }
  return b;
}

/**
 * Fetches held back from the parallel tracks so the expansion loop can still
 * verify tier-4 hints; a run whose whole fetch budget dies in round 0 never
 * confirms the leads it mined (observed failure mode).
 */
export const EXPANSION_FETCH_RESERVE = 10;

/**
 * Consume one unit of budget; false (and a recorded cap) when exhausted.
 * `reserve` leaves that many units untouched for later phases: tracks pass
 * EXPANSION_FETCH_RESERVE so expansion rounds always have fetches left.
 */
export function tryConsume(
  runId: string,
  kind: "search" | "fetch",
  reserve = 0,
): boolean {
  const env = getEnv();
  const b = budgetFor(runId);
  const hardLimit =
    kind === "search" ? env.MAX_SEARCHES_PER_RUN : env.MAX_FETCHES_PER_RUN;
  const limit = Math.max(1, hardLimit - reserve);
  const used = kind === "search" ? b.searches : b.fetches;
  if (used >= limit) {
    if (used >= hardLimit) {
      b.capsHit.add(kind === "search" ? "max_searches" : "max_fetches");
    }
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

/**
 * Canonical URL form for fetch dedupe: trailing slashes, fragments, and
 * host casing must not buy the same page twice (observed: ctownfire.org
 * fetched once with and once without the trailing slash).
 */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

/**
 * Synchronous per-run URL claim: parallel tracks cannot see each other's
 * graph state mid-superstep, so without this the same page is fetched (and
 * budgeted) once per track. First caller wins; later callers skip the URL.
 */
export function claimUrl(runId: string, url: string): boolean {
  const claimed = budgetFor(runId).claimedUrls;
  const key = canonicalUrl(url);
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
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
