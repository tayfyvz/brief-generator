import { desc, eq } from "drizzle-orm";
import { getDb } from "./client";
import { briefs, departments, facts, sources } from "./schema";
import type { Anchor } from "@/lib/schemas/anchor";

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
    .orderBy(desc(briefs.createdAt))
    .limit(limit);
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

  const factRows = await db
    .select()
    .from(facts)
    .where(eq(facts.runId, brief.runId));
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
    .where(eq(sources.runId, brief.runId));

  return { department, brief, facts: factRows, sources: sourceRows };
}
