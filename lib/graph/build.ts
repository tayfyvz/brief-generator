import { END, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { ResearchState } from "./state";
import { makeTrackNode, resolveAnchor, resolveEntity, synthesize } from "./nodes";
import { TRACKS } from "./tracks";
import type { TrackDef } from "./nodes";

function track(key: string): TrackDef {
  const def = TRACKS.find((t) => t.key === key);
  if (!def) throw new Error(`Unknown track ${key}`);
  return def;
}

/**
 * Research graph (PLAN §3): anchor → entity → 6-track fan-out → synthesize.
 * Tracks run in one parallel superstep; synthesize joins on all of them.
 * Expansion loop (N3) and verify (N4) arrive in build steps 6–7.
 * Node names are spelled out because LangGraph types edges by literal name.
 */
export function buildResearchGraph(checkpointer?: BaseCheckpointSaver) {
  const graph = new StateGraph(ResearchState)
    .addNode("resolveAnchor", resolveAnchor)
    .addNode("resolveEntity", resolveEntity)
    .addNode("trackLeadership", makeTrackNode(track("leadership")))
    .addNode("trackFleet", makeTrackNode(track("fleet")))
    .addNode("trackProcurement", makeTrackNode(track("procurement")))
    .addNode("trackFunding", makeTrackNode(track("funding")))
    .addNode("trackNews", makeTrackNode(track("news")))
    .addNode("trackDiscovery", makeTrackNode(track("discovery")))
    .addNode("synthesize", synthesize)
    .addEdge(START, "resolveAnchor")
    .addEdge("resolveAnchor", "resolveEntity")
    .addEdge("resolveEntity", "trackLeadership")
    .addEdge("resolveEntity", "trackFleet")
    .addEdge("resolveEntity", "trackProcurement")
    .addEdge("resolveEntity", "trackFunding")
    .addEdge("resolveEntity", "trackNews")
    .addEdge("resolveEntity", "trackDiscovery")
    .addEdge("trackLeadership", "synthesize")
    .addEdge("trackFleet", "synthesize")
    .addEdge("trackProcurement", "synthesize")
    .addEdge("trackFunding", "synthesize")
    .addEdge("trackNews", "synthesize")
    .addEdge("trackDiscovery", "synthesize")
    .addEdge("synthesize", END);

  return graph.compile(checkpointer ? { checkpointer } : undefined);
}
