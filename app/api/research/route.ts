import { NextResponse } from "next/server";
import { placeIdSchema } from "@/lib/schemas/anchor";
import { getRunManager } from "@/lib/research/run-manager";
import {
  checkGlobalRunLimits,
  checkIpRateLimit,
} from "@/lib/research/guards";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "local"
  );
}

/**
 * Start a research run. Returns immediately with {runId}; a second
 * request for a Place ID with an active run joins it (single-flight, not
 * counted against guards). Pass {resumeRunId} to resume an interrupted run.
 */
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const manager = getRunManager();

  const resumeRunId =
    body && typeof body === "object" && "resumeRunId" in body &&
    typeof body.resumeRunId === "string"
      ? body.resumeRunId
      : null;

  const parsed = resumeRunId
    ? null
    : placeIdSchema.safeParse(
        body && typeof body === "object" && "placeId" in body ? body.placeId : null,
      );
  const placeId = parsed?.success ? parsed.data : null;
  if (!resumeRunId && !placeId) {
    return NextResponse.json(
      { error: "Body must be {placeId: <Google Place ID>}" },
      { status: 400 },
    );
  }

  // Joining an active run is free; no new work starts.
  if (placeId) {
    const active = manager.activeRunFor(placeId);
    if (active) return NextResponse.json({ runId: active, joined: true });
  }

  // Guards apply to anything that starts (or resumes) real research.
  const ipCheck = checkIpRateLimit(clientIp(req));
  if (!ipCheck.ok) {
    return NextResponse.json({ error: ipCheck.reason }, { status: ipCheck.status });
  }
  const globalCheck = await checkGlobalRunLimits();
  if (!globalCheck.ok) {
    return NextResponse.json(
      { error: globalCheck.reason },
      { status: globalCheck.status },
    );
  }

  if (resumeRunId) {
    const result = await manager.resume(resumeRunId);
    return NextResponse.json(result);
  }
  const fresh =
    body !== null && typeof body === "object" && "fresh" in body && body.fresh === true;
  const result = await manager.start(placeId!, { fresh });
  return NextResponse.json(result);
}
