import { END, START, StateGraph } from "@langchain/langgraph";
import { ResearchState } from "./state";
import { makeTrackNode, resolveAnchor, resolveEntity, synthesize } from "./nodes";
import type { TrackDef } from "./nodes";

/**
 * Build-step-4 skeleton: anchor → entity → one track → synthesize.
 * The 6-track fan-out, expansion loop, and verify node arrive in steps 5–7.
 */
export const LEADERSHIP_TRACK: TrackDef = {
  key: "leadership",
  title: "Leadership & contacts",
  focus:
    "Find who runs the department and who to call: chief and command staff, " +
    "board/committee members with budget authority, executive administrators, " +
    "phone numbers, and office hours.",
};

export function buildResearchGraph() {
  return new StateGraph(ResearchState)
    .addNode("resolveAnchor", resolveAnchor)
    .addNode("resolveEntity", resolveEntity)
    .addNode("trackLeadership", makeTrackNode(LEADERSHIP_TRACK))
    .addNode("synthesize", synthesize)
    .addEdge(START, "resolveAnchor")
    .addEdge("resolveAnchor", "resolveEntity")
    .addEdge("resolveEntity", "trackLeadership")
    .addEdge("trackLeadership", "synthesize")
    .addEdge("synthesize", END)
    .compile();
}
