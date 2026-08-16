import { NextResponse } from "next/server";
import { placeIdSchema } from "@/lib/schemas/anchor";
import { getRunManager } from "@/lib/research/run-manager";

export const dynamic = "force-dynamic";

/**
 * Start a research run (PLAN §2). Returns immediately with {runId}; a second
 * request for a Place ID with an active run joins it (single-flight).
 * Pass {resumeRunId} to resume an interrupted run instead.
 */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const manager = getRunManager();

  if (
    body &&
    typeof body === "object" &&
    "resumeRunId" in body &&
    typeof body.resumeRunId === "string"
  ) {
    const result = await manager.resume(body.resumeRunId);
    return NextResponse.json(result);
  }

  const placeId = placeIdSchema.safeParse(
    body && typeof body === "object" && "placeId" in body ? body.placeId : null,
  );
  if (!placeId.success) {
    return NextResponse.json(
      { error: "Body must be {placeId: <Google Place ID>}" },
      { status: 400 },
    );
  }
  const result = await manager.start(placeId.data);
  return NextResponse.json(result);
}
