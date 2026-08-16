import { describe, expect, it } from "vitest";
import { normalizeAsOfDate } from "@/lib/research/facts";

describe("normalizeAsOfDate", () => {
  it("passes full ISO dates through", () => {
    expect(normalizeAsOfDate("2024-06-01")).toBe("2024-06-01");
  });

  it("pads partial dates the model returns", () => {
    expect(normalizeAsOfDate("2025")).toBe("2025-01-01");
    expect(normalizeAsOfDate("2024-06")).toBe("2024-06-01");
    expect(normalizeAsOfDate("2024-6-3")).toBe("2024-06-03");
  });

  it("rejects garbage instead of failing the insert", () => {
    expect(normalizeAsOfDate("recent")).toBeNull();
    expect(normalizeAsOfDate("2025-13-01")).toBeNull();
    expect(normalizeAsOfDate("2025-02-31")).toBeNull();
    expect(normalizeAsOfDate("0100-01-01")).toBeNull();
    expect(normalizeAsOfDate(null)).toBeNull();
  });
});
