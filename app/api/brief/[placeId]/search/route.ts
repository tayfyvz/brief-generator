import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { briefs } from "@/lib/db/schema";
import { placeIdSchema } from "@/lib/schemas/anchor";

export const dynamic = "force-dynamic";

/**
 * AE quick-find: Postgres FTS over claim/quote/tags for the
 * department's current brief. Highlight markers ⟦…⟧ are converted to <mark>
 * client-side (no HTML crosses the wire).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const { placeId: raw } = await params;
  const placeId = placeIdSchema.safeParse(raw);
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (!placeId.success || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const db = getDb();
  const [brief] = await db
    .select({ runId: briefs.runId })
    .from(briefs)
    .where(eq(briefs.placeId, placeId.data))
    .limit(1);
  if (!brief) return NextResponse.json({ results: [] });

  const query = sql`websearch_to_tsquery('english', ${q})`;
  const { rows } = await db.execute<{
    id: string;
    category: string;
    claim: string;
    quote: string;
  }>(sql`
    SELECT f.id,
           f.category,
           ts_headline('english', f.claim, ${query}, 'StartSel=⟦, StopSel=⟧') AS claim,
           ts_headline('english', f.quote, ${query}, 'StartSel=⟦, StopSel=⟧') AS quote
    FROM facts f
    WHERE f.run_id = ${brief.runId}
      AND (f.verification IS NULL OR f.verification NOT IN ('rejected', 'duplicate'))
      AND f.search_vec @@ ${query}
    ORDER BY ts_rank(f.search_vec, ${query}) DESC
    LIMIT 20
  `);

  return NextResponse.json({ results: rows });
}
