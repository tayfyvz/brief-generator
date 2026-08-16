import { describe, expect, it } from "vitest";
import {
  anchorTerms,
  cleanMarkdown,
  extractionSlice,
} from "@/lib/research/markdown";

const anchor = {
  placeId: "test-place",
  name: "Lexington Volunteer Fire Department",
  city: "Lexington",
  county: "Scott County",
  state: "Indiana",
};

describe("cleanMarkdown", () => {
  it("makes IRS-form table rows contiguous (images, <br>, dot leaders)", () => {
    const row =
      "| 9 | **Total revenue.** Add lines 1 and 8<br> ..............<br> ![Bullet](https://static.example.org/b.gif) | 9 | 86,777 |";
    const cleaned = cleanMarkdown(row);
    expect(cleaned).not.toContain("<br>");
    expect(cleaned).not.toContain("![Bullet]");
    expect(cleaned).not.toContain("....");
    expect(cleaned).toContain("Total revenue.** Add lines 1 and 8");
    expect(cleaned).toContain("86,777");
  });

  it("keeps ordinary prose and three-dot ellipses intact", () => {
    const text = "The chief said more trucks are coming... next year.\n\nBudget: $40,000.";
    expect(cleanMarkdown(text)).toBe(text);
  });

  it("collapses runs of blank lines", () => {
    expect(cleanMarkdown("a\n\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("anchorTerms", () => {
  it("keeps distinctive words, drops generic fire-service words", () => {
    expect(anchorTerms(anchor).sort()).toEqual(["lexington", "scott"]);
  });
});

describe("extractionSlice", () => {
  it("returns short pages whole", () => {
    expect(extractionSlice("short page", ["lexington"])).toBe("short page");
  });

  it("keeps a department mention buried deep in a very long page", () => {
    const filler = Array.from({ length: 2000 }, (_, i) => `Update ${i}: some other town got a truck.`);
    filler.push("5/30/2025: Lexington (Scott): New E4299, Brush 4410 and updates");
    filler.push("Photos by the crew.");
    const page = filler.join("\n");
    expect(page.length).toBeGreaterThan(60_000);
    const sliced = extractionSlice(page, anchorTerms(anchor));
    expect(sliced).toContain("New E4299");
    expect(sliced).toContain("Excerpts from later");
    expect(sliced.length).toBeLessThan(page.length);
  });

  it("falls back to the head when nothing later matches", () => {
    const page = "x".repeat(50_000);
    expect(extractionSlice(page, ["lexington"]).length).toBe(40_000);
  });
});
