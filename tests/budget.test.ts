import { describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.MAX_SEARCHES_PER_RUN = "2";
process.env.MAX_FETCHES_PER_RUN = "1";

const {
  tryConsume,
  hasBudget,
  capsHitFor,
  recordCap,
  releaseBudget,
  canonicalUrl,
  claimUrl,
} = await import("@/lib/research/budget");

describe("run budget", () => {
  it("enforces search and fetch caps and records what was hit", () => {
    const runId = "run-a";
    expect(tryConsume(runId, "search")).toBe(true);
    expect(tryConsume(runId, "search")).toBe(true);
    expect(tryConsume(runId, "search")).toBe(false); // cap = 2
    expect(tryConsume(runId, "fetch")).toBe(true);
    expect(tryConsume(runId, "fetch")).toBe(false); // cap = 1
    expect(capsHitFor(runId).sort()).toEqual(["max_fetches", "max_searches"]);
    releaseBudget(runId);
  });

  it("hasBudget requires both search and fetch headroom", () => {
    const runId = "run-b";
    expect(hasBudget(runId)).toBe(true);
    tryConsume(runId, "fetch"); // exhausts fetches (cap = 1)
    expect(hasBudget(runId)).toBe(false);
    releaseBudget(runId);
  });

  it("tracks runs independently and supports explicit caps", () => {
    recordCap("run-c", "max_rounds");
    expect(capsHitFor("run-c")).toEqual(["max_rounds"]);
    expect(capsHitFor("run-d")).toEqual([]);
    releaseBudget("run-c");
    releaseBudget("run-d");
  });
});

describe("url claims", () => {
  it("normalizes trailing slash, fragment, and host casing", () => {
    expect(canonicalUrl("https://Ctownfire.org/")).toBe(canonicalUrl("https://ctownfire.org"));
    expect(canonicalUrl("https://a.org/p#x")).toBe(canonicalUrl("https://a.org/p"));
    expect(canonicalUrl("not a url")).toBe("not a url");
  });

  it("lets only the first claimant fetch a URL, per run", () => {
    expect(claimUrl("run-e", "https://ctownfire.org")).toBe(true);
    expect(claimUrl("run-e", "https://ctownfire.org/")).toBe(false);
    expect(claimUrl("run-f", "https://ctownfire.org")).toBe(true);
    releaseBudget("run-e");
    releaseBudget("run-f");
  });
});
