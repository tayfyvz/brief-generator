import type { Anchor } from "@/lib/schemas/anchor";
import type { EntityGraph } from "@/lib/schemas/llm";

/**
 * The anchor packet (PLAN §3 N0); injected into every prompt with the
 * standing wrong-department rule (failure mode #1).
 */
export function anchorPacket(anchor: Anchor, entityGraph?: EntityGraph | null): string {
  const lines = [
    "## Department anchor (ground truth from Google Places)",
    `Name: ${anchor.name}`,
    anchor.address && `Address: ${anchor.address}`,
    anchor.city && `City: ${anchor.city}`,
    anchor.county && `County: ${anchor.county}`,
    anchor.state && `State: ${anchor.state}`,
    anchor.phone && `Phone: ${anchor.phone}`,
    anchor.website && `Website: ${anchor.website}`,
    "",
    "STANDING RULE: discard any source about a similarly-named department in a",
    "different city, county, or state. Verify location context before trusting",
    "a page; wrong-department contamination is the #1 failure mode.",
  ].filter((l): l is string => typeof l === "string");

  if (entityGraph) {
    lines.push(
      "",
      "## Entity graph (who operates this station / who buys the trucks)",
      entityGraph.buyerSummary,
      ...entityGraph.entities.map(
        (e) => `- [${e.kind}] ${e.name}${e.note ? `; ${e.note}` : ""}`,
      ),
    );
  }
  return lines.join("\n");
}
