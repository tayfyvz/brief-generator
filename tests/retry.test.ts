import { describe, expect, it } from "vitest";
import { withDegrade, withRetry } from "@/lib/tools/retry";
import type { Warning } from "@/lib/schemas/tools";

describe("withRetry", () => {
  it("returns on first success", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("flaky");
        return "ok";
      },
      { retries: 2, baseDelayMs: 1 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws after exhausting retries", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("down");
        },
        { retries: 1, baseDelayMs: 1, label: "tavily" },
      ),
    ).rejects.toThrow(/tavily failed after 2 attempts/);
    expect(calls).toBe(2);
  });
});

describe("withDegrade", () => {
  it("degrades to fallback with a visible warning", async () => {
    const warnings: Warning[] = [];
    const result = await withDegrade(
      async () => {
        throw new Error("api down");
      },
      [] as string[],
      "track:news",
      (w) => warnings.push(w),
      { retries: 0, baseDelayMs: 1 },
    );
    expect(result).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].scope).toBe("track:news");
    expect(warnings[0].message).toContain("api down");
  });

  it("passes through success without warnings", async () => {
    const warnings: Warning[] = [];
    const result = await withDegrade(
      async () => ["hit"],
      [],
      "search",
      (w) => warnings.push(w),
    );
    expect(result).toEqual(["hit"]);
    expect(warnings).toHaveLength(0);
  });
});
