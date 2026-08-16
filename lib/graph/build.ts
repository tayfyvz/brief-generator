import { END, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { ResearchState } from "./state";
import {
  makeTrackNode,
  planExpansion,
  resolveAnchor,
  resolveEntity,
  shouldContinueExpansion,
  synthesize,
} from "./nodes";
import { TRACKS } from "./tracks";
import type { TrackDef } from "./nodes";

function track(key: string): TrackDef {
  const def = TRACKS.find((t) => t.key === key);
  if (!def) throw new Error(`Unknown track ${key}`);
  return def;
}

/**
 * Research graph (PLAN §3): anchor → entity → 6-track fan-out → expansion
 * loop ⟲ → synthesize. Tracks run in one parallel superstep and join on
 * planExpansion, which loops until two dry rounds, the round cap, or the
 * run budget. Verify (N4) arrives in build step 7.
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
    .addNode("planExpansion", planExpansion)
    .addNode("synthesize", synthesize)
    .addEdge(START, "resolveAnchor")
    .addEdge("resolveAnchor", "resolveEntity")
    .addEdge("resolveEntity", "trackLeadership")
    .addEdge("resolveEntity", "trackFleet")
    .addEdge("resolveEntity", "trackProcurement")
    .addEdge("resolveEntity", "trackFunding")
    .addEdge("resolveEntity", "trackNews")
    .addEdge("resolveEntity", "trackDiscovery")
    .addEdge("trackLeadership", "planExpansion")
    .addEdge("trackFleet", "planExpansion")
    .addEdge("trackProcurement", "planExpansion")
    .addEdge("trackFunding", "planExpansion")
    .addEdge("trackNews", "planExpansion")
    .addEdge("trackDiscovery", "planExpansion")
    .addConditionalEdges("planExpansion", shouldContinueExpansion, [
      "planExpansion",
      "synthesize",
    ])
    .addEdge("synthesize", END);

  return graph.compile(checkpointer ? { checkpointer } : undefined);
}
