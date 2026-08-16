import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import type { FetchedPage } from "@/lib/schemas/tools";

export function contentHash(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex");
}

/**
 * Persist a fetched page as a source snapshot (provenance for
 * citation popovers). Deduped per run by URL: re-fetching the same page in
 * a run returns the existing source id instead of inserting a duplicate.
 */
export async function saveSnapshot(
  runId: string,
  page: FetchedPage,
  tier: number,
): Promise<{ sourceId: string; deduped: boolean }> {
  const db = getDb();
  const existing = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.runId, runId), eq(sources.url, page.url)))
    .limit(1);
  if (existing[0]) return { sourceId: existing[0].id, deduped: true };

  const inserted = await db
    .insert(sources)
    .values({
      runId,
      url: page.url,
      title: page.title ?? null,
      tier,
      contentMd: page.markdown,
      contentHash: contentHash(page.markdown),
      fetchedAt: new Date(),
      publishedAt: page.publishedAt ?? null,
    })
    .returning({ id: sources.id });
  return { sourceId: inserted[0].id, deduped: false };
}
