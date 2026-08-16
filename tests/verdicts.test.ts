import { describe, expect, it } from "vitest";
import { applyVerifyVerdicts } from "@/lib/research/verdicts";
import type { StoredFact } from "@/lib/graph/state";
import type { VerifyVerdicts } from "@/lib/schemas/llm";

function fact(id: string, overrides: Partial<StoredFact> = {}): StoredFact {
  return {
    id,
    sourceId: `src-${id}`,
    category: "fleet",
    tags: [],
    claim: `claim ${id}`,
    quote: `quote ${id}`,
    asOfDate: null,
    tier: 1,
    usefulness: "high",
    ...overrides,
  };
}

const supported = (ids: string[]) =>
  ids.map((id) => ({ factId: id, verdict: "supported" as const }));

describe("applyVerifyVerdicts", () => {
  it("marks unsupported facts rejected and keeps the rest", () => {
    const facts = [fact("a"), fact("b")];
    const verdicts: VerifyVerdicts = {
      verdicts: [
        { factId: "a", verdict: "supported" },
        { factId: "b", verdict: "unsupported" },
      ],
      duplicates: [],
      conflicts: [],
    };
    const r = applyVerifyVerdicts(facts, verdicts);
    expect(r.rejectedIds).toEqual(["b"]);
    expect(r.surviving.map((f) => f.id)).toEqual(["a"]);
    expect(r.verifiedIds).toEqual(["a"]);
  });

  it("hides duplicate restatements but keeps the canonical fact", () => {
    const facts = [fact("keep"), fact("dup1"), fact("dup2")];
    const verdicts: VerifyVerdicts = {
      verdicts: supported(["keep", "dup1", "dup2"]),
      duplicates: [
        { topic: "Engine 272", keepFactId: "keep", dropFactIds: ["dup1", "dup2"] },
      ],
      conflicts: [],
    };
    const r = applyVerifyVerdicts(facts, verdicts);
    expect(r.duplicateIds.sort()).toEqual(["dup1", "dup2"]);
    expect(r.surviving.map((f) => f.id)).toEqual(["keep"]);
    expect(r.verifiedIds).toEqual(["keep"]);
  });

  it("never conflicts a fact that was already dropped as a duplicate", () => {
    const facts = [fact("keep"), fact("dup"), fact("other")];
    const verdicts: VerifyVerdicts = {
      verdicts: supported(["keep", "dup", "other"]),
      duplicates: [{ topic: "t", keepFactId: "keep", dropFactIds: ["dup"] }],
      conflicts: [
        { topic: "t", factIds: ["dup", "other"], note: "one side is a duplicate" },
      ],
    };
    const r = applyVerifyVerdicts(facts, verdicts);
    // The conflict collapses below two members once the duplicate is gone.
    expect(r.conflicts).toEqual([]);
    expect(r.conflictedIds).toEqual([]);
    expect(r.verifiedIds.sort()).toEqual(["keep", "other"]);
  });

  it("keeps genuine conflicts and marks both sides conflicted", () => {
    const facts = [fact("a"), fact("b")];
    const verdicts: VerifyVerdicts = {
      verdicts: supported(["a", "b"]),
      duplicates: [],
      conflicts: [
        { topic: "chief", factIds: ["a", "b"], note: "T1 beats T3, a wins" },
      ],
    };
    const r = applyVerifyVerdicts(facts, verdicts);
    expect(r.conflictedIds.sort()).toEqual(["a", "b"]);
    expect(r.verifiedIds).toEqual([]);
    expect(r.surviving).toHaveLength(2);
    expect(r.conflicts).toHaveLength(1);
  });

  it("ignores verdicts, duplicates, and conflicts about unknown fact ids", () => {
    const facts = [fact("a")];
    const verdicts: VerifyVerdicts = {
      verdicts: [
        { factId: "a", verdict: "supported" },
        { factId: "ghost", verdict: "unsupported" },
      ],
      duplicates: [
        { topic: "t", keepFactId: "ghost", dropFactIds: ["a"] },
        { topic: "t2", keepFactId: "a", dropFactIds: ["ghost"] },
      ],
      conflicts: [{ topic: "t", factIds: ["a", "ghost"], note: "n" }],
    };
    const r = applyVerifyVerdicts(facts, verdicts);
    expect(r.rejectedIds).toEqual([]);
    expect(r.duplicateIds).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(r.surviving.map((f) => f.id)).toEqual(["a"]);
    expect(r.verifiedIds).toEqual(["a"]);
  });

  it("does not drop duplicates whose kept fact was rejected", () => {
    const facts = [fact("keep"), fact("dup")];
    const verdicts: VerifyVerdicts = {
      verdicts: [
        { factId: "keep", verdict: "unsupported" },
        { factId: "dup", verdict: "supported" },
      ],
      duplicates: [{ topic: "t", keepFactId: "keep", dropFactIds: ["dup"] }],
      conflicts: [],
    };
    const r = applyVerifyVerdicts(facts, verdicts);
    expect(r.rejectedIds).toEqual(["keep"]);
    expect(r.duplicateIds).toEqual([]);
    expect(r.surviving.map((f) => f.id)).toEqual(["dup"]);
  });
});
