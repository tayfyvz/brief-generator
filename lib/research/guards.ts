import { gte, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { researchRuns } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";

/**
 * Global abuse guards for the public demo endpoint (PLAN §2): per-IP rate
 * limit (in-memory), max concurrent runs, daily run limit. Cached-brief
 * reads are never guarded — they're cheap.
 */

const ipHits = new Map<string, number[]>();
const HOUR_MS = 3_600_000;

export type GuardResult =
  | { ok: true }
  | { ok: false; status: number; reason: string };

export function checkIpRateLimit(ip: string, now = Date.now()): GuardResult {
  const limit = getEnv().RATE_LIMIT_RUNS_PER_IP_PER_HOUR;
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
  if (hits.length >= limit) {
    ipHits.set(ip, hits);
    return {
      ok: false,
      status: 429,
      reason: `Rate limit: at most ${limit} research runs per hour per client.`,
    };
  }
  hits.push(now);
  ipHits.set(ip, hits);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (ipHits.size > 10_000) {
    for (const [key, stamps] of ipHits) {
      if (stamps.every((t) => now - t >= HOUR_MS)) ipHits.delete(key);
    }
  }
  return { ok: true };
}

/** DB-backed guards: concurrent running runs and runs started today. */
export async function checkGlobalRunLimits(): Promise<GuardResult> {
  const env = getEnv();
  const db = getDb();
  const dayAgo = new Date(Date.now() - 24 * HOUR_MS);
  const [row] = await db
    .select({
      running: sql<number>`count(*) FILTER (WHERE ${inArray(researchRuns.status, ["running", "queued"])})`,
      daily: sql<number>`count(*) FILTER (WHERE ${gte(researchRuns.startedAt, dayAgo)})`,
    })
    .from(researchRuns)
    .where(
      or(
        inArray(researchRuns.status, ["running", "queued"]),
        gte(researchRuns.startedAt, dayAgo),
      ),
    );
  if (Number(row.running) >= env.MAX_CONCURRENT_RUNS) {
    return {
      ok: false,
      status: 503,
      reason: "Too many research runs in flight — try again in a minute.",
    };
  }
  if (Number(row.daily) >= env.DAILY_RUN_LIMIT) {
    return {
      ok: false,
      status: 429,
      reason: "Daily research budget exhausted — cached briefs remain available.",
    };
  }
  return { ok: true };
}

/** Test hook: reset in-memory rate limit state. */
export function resetIpRateLimit(): void {
  ipHits.clear();
}
