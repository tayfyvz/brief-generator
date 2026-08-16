import { EventEmitter } from "node:events";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { researchRuns, runEvents } from "@/lib/db/schema";
import { createRunRow, executeGraph } from "@/lib/graph/run";
import type { PersistedRunEvent, RunEvent } from "@/lib/schemas/events";

/**
 * RunManager singleton (PLAN §2): starts research runs in-process, enforces
 * single-flight per Place ID, assigns event sequence numbers, persists every
 * event to run_events (SSE replay log), and fans events out to live
 * subscribers. No queue, no Redis; one long-running server.
 */

interface ActiveRun {
  runId: string;
  placeId: string;
  emitter: EventEmitter;
  seq: number;
  /** Chain that serializes event inserts so seq order matches insert order. */
  persistChain: Promise<void>;
  finished: boolean;
}

class RunManager {
  private byPlace = new Map<string, ActiveRun>();
  private byRun = new Map<string, ActiveRun>();

  /** Start research for a Place ID, or join the already-active run. */
  async start(placeId: string): Promise<{ runId: string; joined: boolean }> {
    const existing = this.byPlace.get(placeId);
    if (existing && !existing.finished) {
      return { runId: existing.runId, joined: true };
    }
    const runId = await createRunRow(placeId);
    const active = this.activate(runId, placeId, 0);
    void this.execute(active, false);
    return { runId, joined: false };
  }

  /** Resume an interrupted run from its LangGraph checkpoint. */
  async resume(runId: string): Promise<{ runId: string; resumed: boolean }> {
    if (this.byRun.get(runId) && !this.byRun.get(runId)!.finished) {
      return { runId, resumed: false };
    }
    const db = getDb();
    const [run] = await db
      .select()
      .from(researchRuns)
      .where(eq(researchRuns.id, runId))
      .limit(1);
    if (!run || run.status !== "interrupted") {
      return { runId, resumed: false };
    }
    const [lastEvent] = await db
      .select({ seq: runEvents.seq })
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(desc(runEvents.seq))
      .limit(1);
    await db
      .update(researchRuns)
      .set({ status: "running", error: null })
      .where(eq(researchRuns.id, runId));
    const active = this.activate(runId, run.placeId, lastEvent?.seq ?? 0);
    void this.execute(active, true);
    return { runId, resumed: true };
  }

  isActive(runId: string): boolean {
    const run = this.byRun.get(runId);
    return Boolean(run && !run.finished);
  }

  activeRunFor(placeId: string): string | null {
    const run = this.byPlace.get(placeId);
    return run && !run.finished ? run.runId : null;
  }

  /** Subscribe to live events for a run. Returns an unsubscribe function. */
  subscribe(
    runId: string,
    listener: (event: PersistedRunEvent) => void,
  ): () => void {
    const run = this.byRun.get(runId);
    if (!run) return () => undefined;
    run.emitter.on("event", listener);
    return () => run.emitter.off("event", listener);
  }

  private activate(runId: string, placeId: string, startSeq: number): ActiveRun {
    const active: ActiveRun = {
      runId,
      placeId,
      emitter: new EventEmitter(),
      seq: startSeq,
      persistChain: Promise.resolve(),
      finished: false,
    };
    active.emitter.setMaxListeners(100);
    this.byPlace.set(placeId, active);
    this.byRun.set(runId, active);
    return active;
  }

  private emit(active: ActiveRun, event: RunEvent): void {
    const seq = ++active.seq;
    const persisted: PersistedRunEvent = { seq, event };
    active.persistChain = active.persistChain
      .then(() =>
        getDb()
          .insert(runEvents)
          .values({ runId: active.runId, seq, type: event.type, payload: event })
          .then(() => undefined),
      )
      .catch((err) => {
        console.error(`[run ${active.runId}] failed to persist event:`, err);
      });
    active.emitter.emit("event", persisted);
  }

  private async execute(active: ActiveRun, resume: boolean): Promise<void> {
    try {
      await executeGraph({
        runId: active.runId,
        placeId: active.placeId,
        resume,
        emit: (event) => this.emit(active, event),
      });
    } catch (err) {
      console.error(`[run ${active.runId}] unexpected failure:`, err);
    } finally {
      await active.persistChain;
      active.finished = true;
      active.emitter.emit("finished");
      // Keep maps clean; late subscribers replay from run_events instead.
      if (this.byPlace.get(active.placeId) === active) {
        this.byPlace.delete(active.placeId);
      }
      this.byRun.delete(active.runId);
    }
  }
}

const globalForRm = globalThis as unknown as { __briefRunManager?: RunManager };

export function getRunManager(): RunManager {
  globalForRm.__briefRunManager ??= new RunManager();
  return globalForRm.__briefRunManager;
}
