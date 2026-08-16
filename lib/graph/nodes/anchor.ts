import { getPlacesClient } from "@/lib/tools/places";
import { upsertDepartment } from "@/lib/db/queries";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { ResearchStateType } from "../state";
import { emitterOf, type Update } from "./shared";

/** N0; deterministic Places lookup; anchors every later prompt. */
export async function resolveAnchor(
  state: ResearchStateType,
  config?: LangGraphRunnableConfig,
): Promise<Update> {
  const emit = emitterOf(config);
  emit({ type: "phase", phase: "anchor", status: "start" });
  const anchor = await getPlacesClient().getDetails(state.placeId);
  if (!anchor) {
    throw new Error(`Place ID ${state.placeId} did not resolve to a place`);
  }
  await upsertDepartment(anchor);
  emit({ type: "phase", phase: "anchor", status: "done" });
  return { anchor };
}
