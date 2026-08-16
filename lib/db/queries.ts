import { and, asc, desc, eq, inArray, isNull, notInArray, notLike, or, sql } from "drizzle-orm";
import { getDb } from "./client";
import { briefs, departments, facts, researchRuns, runEvents, sources } from "./schema";
import type { Anchor } from "@/lib/schemas/anchor";
import type { Warning } from "@/lib/schemas/tools";

export async function upsertDepartment(anchor: Anchor) {
  const db = getDb();
  const row = {
    placeId: anchor.placeId,
    name: anchor.name,
    address: anchor.address ?? null,
    city: anchor.city ?? null,
    county: anchor.county ?? null,
    state: anchor.state ?? null,
    phone: anchor.phone ?? null,
    website: anchor.website ?? null,
    lat: anchor.lat ?? null,
    lng: anchor.lng ?? null,
    anchor,
  };
  await db
    .insert(departments)
    .values(row)
    .onConflictDoUpdate({ target: departments.placeId, set: row });
}

export async function getRecentBriefs(limit = 8) {
  const db = getDb();
  return db
    .select({
      placeId: briefs.placeId,
      createdAt: briefs.createdAt,
      name: departments.name,
      city: departments.city,
      state: departments.state,
    })
    .from(briefs)
    .innerJoin(departments, eq(briefs.placeId, departments.placeId))
    // Integration-test departments must never surface in the product UI.
    .where(notLike(briefs.placeId, "Test%"))
    .orderBy(desc(briefs.createdAt))
    .limit(limit);
}

/** Paginated brief library for the /briefs page. */
export async function getBriefLibrary(page = 1, pageSize = 12) {
  const db = getDb();
  const where = notLike(briefs.placeId, "Test%");
  const rows = await db
    .select({
      placeId: briefs.placeId,
      createdAt: briefs.createdAt,
      name: departments.name,
      city: departments.city,
      state: departments.state,
    })
    .from(briefs)
    .innerJoin(departments, eq(briefs.placeId, departments.placeId))
    .where(where)
    .orderBy(desc(briefs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(briefs)
    .innerJoin(departments, eq(briefs.placeId, departments.placeId))
    .where(where);
  return { rows, total };
}

export async function getDepartment(placeId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(departments)
    .where(eq(departments.placeId, placeId))
    .limit(1);
  return rows[0] ?? null;
}

/** Most recent run for a department (freshness, resume, caps). */
export async function getLatestRun(placeId: string) {
  const rows = await getDb()
    .select()
    .from(researchRuns)
    .where(eq(researchRuns.placeId, placeId))
    .orderBy(desc(researchRuns.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Warnings persisted during a run; rendered as honest research notes. */
export async function getRunWarnings(runId: string): Promise<Warning[]> {
  const rows = await getDb()
    .select({ payload: runEvents.payload })
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), eq(runEvents.type, "warning")))
    .orderBy(asc(runEvents.seq));
  return rows.map((r) => (r.payload as { warning: Warning }).warning);
}

/** Everything the cached brief page needs, in one round-trip-per-table shot. */
export async function getBriefPageData(placeId: string) {
  const db = getDb();
  const department = await getDepartment(placeId);
  if (!department) return null;

  const briefRows = await db
    .select()
    .from(briefs)
    .where(eq(briefs.placeId, placeId))
    .limit(1);
  const brief = briefRows[0] ?? null;
  if (!brief) return { department, brief: null, facts: [], sources: [] };

  // Rejected facts are never shown; duplicates are hidden
  // because their kept fact renders instead. Everything else is shown with
  // its verification state rendered honestly. Usefulness sorts high first
  // (nulls with medium), then source tier, then recency.
  const factRows = await db
    .select()
    .from(facts)
    .where(
      and(
        eq(facts.runId, brief.runId),
        or(
          isNull(facts.verification),
          notInArray(facts.verification, ["rejected", "duplicate"]),
        ),
      ),
    )
    .orderBy(
      sql`CASE ${facts.usefulness} WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 3 ELSE 1 END`,
      sql`${facts.asOfDate} DESC NULLS LAST`,
    );
  // Carried-forward facts cite source rows from earlier runs, so load
  // sources by reference too, not just by this run's id.
  const citedSourceIds = [...new Set(factRows.map((f) => f.sourceId))];
  const sourceRows = await db
    .select({
      id: sources.id,
      runId: sources.runId,
      url: sources.url,
      title: sources.title,
      tier: sources.tier,
      contentHash: sources.contentHash,
      fetchedAt: sources.fetchedAt,
      publishedAt: sources.publishedAt,
    })
    .from(sources)
    .where(
      citedSourceIds.length > 0
        ? or(eq(sources.runId, brief.runId), inArray(sources.id, citedSourceIds))
        : eq(sources.runId, brief.runId),
    );

  return { department, brief, facts: factRows, sources: sourceRows };
}
