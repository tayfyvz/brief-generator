import { NextResponse } from "next/server";
import { getRunManager } from "@/lib/research/run-manager";
import { getDepartment } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * Runs currently in flight, with a display name when the department has
 * already been anchored. The home page uses this list to attach an SSE
 * stream per run and show live progress.
 */
export async function GET() {
  const active = getRunManager().listActive();
  const runs = await Promise.all(
    active.map(async ({ runId, placeId }) => {
      const department = await getDepartment(placeId).catch(() => null);
      const name =
        department && department.name !== "(resolving…)" ? department.name : null;
      return { runId, placeId, name };
    }),
  );
  return NextResponse.json({ runs });
}
