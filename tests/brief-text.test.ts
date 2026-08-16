import { describe, expect, it } from "vitest";
import { briefToMarkdown } from "@/lib/brief-text";

const base = {
  name: "Lexington Fire Department",
  location: "Lexington, Indiana",
  address: "8060 E Main St",
  phone: "(812) 555-0100",
  website: "https://example.gov",
  researchedAt: new Date("2026-08-16T12:00:00Z"),
  summary: "Volunteer department, single station.",
  whyCallToday: [
    { headline: "1980 engine still first-line", detail: "45-year-old pumper" },
  ],
  sections: [
    {
      title: "What they drive",
      emptyNote: "No verified apparatus information found in this run.",
      facts: [
        { claim: "Runs a 1980 Ford/American pumper.", sourceUrl: "https://a.example/roster" },
        { claim: "Tanker built in-house in 1994.", sourceUrl: "https://a.example/roster" },
      ],
    },
    {
      title: "Recent signals",
      emptyNote: "No verified recent news found in this run.",
      facts: [],
    },
  ],
  notes: ["Apparatus roster is community-sourced (unconfirmed)."],
};

describe("briefToMarkdown", () => {
  it("renders every section, citing each fact and numbering sources once", () => {
    const md = briefToMarkdown(base);
    expect(md).toContain("# Lexington Fire Department");
    expect(md).toContain("Lexington, Indiana · 8060 E Main St");
    expect(md).toContain("Phone: (812) 555-0100 · Website: https://example.gov");
    expect(md).toContain("Researched Aug 16, 2026");
    expect(md).toContain("## At a glance\nVolunteer department, single station.");
    expect(md).toContain("1. 1980 engine still first-line — 45-year-old pumper");
    // Same source cited twice gets one number.
    expect(md).toContain("Runs a 1980 Ford/American pumper. [1]");
    expect(md).toContain("Tanker built in-house in 1994. [1]");
    expect(md).toContain("[1] https://a.example/roster");
    expect(md.match(/^\[1\] /gm)).toHaveLength(1);
  });

  it("keeps empty sections honest and omits empty blocks", () => {
    const md = briefToMarkdown({
      ...base,
      summary: undefined,
      whyCallToday: [],
      notes: [],
    });
    expect(md).toContain(
      "## Recent signals\nNo verified recent news found in this run.",
    );
    expect(md).not.toContain("## At a glance");
    expect(md).not.toContain("## Why call today");
    expect(md).not.toContain("## Research notes");
  });

  it("cites nothing when a fact has no source url", () => {
    const md = briefToMarkdown({
      ...base,
      sections: [
        {
          title: "What they drive",
          emptyNote: "n/a",
          facts: [{ claim: "Uncited claim.", sourceUrl: null }],
        },
      ],
    });
    expect(md).toContain("- Uncited claim.\n");
    expect(md).not.toContain("## Sources");
  });
});
