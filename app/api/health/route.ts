import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch (err) {
    return NextResponse.json(
      { status: "degraded", db: "unreachable", error: String(err) },
      { status: 503 },
    );
  }
}
