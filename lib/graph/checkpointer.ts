import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { getEnv } from "@/lib/env";

/**
 * LangGraph Postgres checkpointer (PLAN §2 crash safety): graph state is
 * persisted per node, so interrupted runs can resume mid-phase with the
 * run id as thread id.
 */
const globalForCp = globalThis as unknown as {
  __briefCheckpointer?: { saver: PostgresSaver; ready: Promise<void> };
};

export async function getCheckpointer(): Promise<PostgresSaver> {
  if (!globalForCp.__briefCheckpointer) {
    const saver = PostgresSaver.fromConnString(getEnv().DATABASE_URL);
    globalForCp.__briefCheckpointer = { saver, ready: saver.setup() };
  }
  await globalForCp.__briefCheckpointer.ready;
  return globalForCp.__briefCheckpointer.saver;
}
