import { describe, expect, it } from "vitest";
import { isStale } from "@/lib/research/staleness";

const NOW = new Date("2026-08-15T00:00:00Z");

describe("isStale", () => {
  it("flags facts older than 18 months", () => {
    expect(isStale("2022-09-14", NOW)).toBe(true);
    expect(isStale("2024-06-01", NOW)).toBe(true); // ~26 months
  });

  it("keeps recent facts fresh", () => {
    expect(isStale("2025-05-20", NOW)).toBe(false);
    expect(isStale("2026-08-01", NOW)).toBe(false);
  });

  it("treats undated and unparseable dates as not stale", () => {
    expect(isStale(null, NOW)).toBe(false);
    expect(isStale("not-a-date", NOW)).toBe(false);
  });
});
