import { describe, expect, it } from "vitest";
import {
  renderBriefContext,
  renderChatPrompt,
  resolveCitations,
  type ChatContextInput,
} from "@/lib/llm/prompts/chat";

const input: ChatContextInput = {
  department: {
    name: "Lexington Volunteer Fire Department",
    address: "123 Main St",
    city: "Lexington",
    state: "IN",
    phone: "(812) 555-0100",
    website: "https://example.org",
  },
  summary: "Small volunteer department.",
  whyCallToday: [{ headline: "New engine funded", date: "2026-01-15" }],
  caveats: ["No chief name found."],
  facts: [
    {
      id: "f1",
      category: "fleet",
      claim: "Runs a 2004 pumper.",
      detail: null,
      quote: "q".repeat(400),
      asOfDate: "2025-06-01",
      confidence: "low",
      verification: "conflicted",
      stale: true,
      sourceId: "s1",
    },
  ],
  sources: [{ id: "s1", url: "https://fire.fandom.com/x", title: "Roster", tier: 4 }],
};

describe("renderBriefContext", () => {
  it("is deterministic and carries ids, flags, and truncated quotes", () => {
    const text = renderBriefContext(input);
    expect(renderBriefContext(input)).toBe(text);
    expect(text).toContain("[f1]");
    expect(text).toContain("community source, unconfirmed");
    expect(text).toContain("may be stale");
    expect(text).toContain("conflicting sources");
    expect(text).toContain("No chief name found.");
    expect(text).not.toContain("q".repeat(301));
  });
});

describe("renderChatPrompt", () => {
  it("labels roles and keeps order", () => {
    const text = renderChatPrompt([
      { role: "user", content: "Who is the chief?" },
      { role: "assistant", content: "The brief doesn't contain that information." },
      { role: "user", content: "What do they drive?" },
    ]);
    expect(text.indexOf("AE: Who is the chief?")).toBeGreaterThan(-1);
    expect(text.indexOf("ASSISTANT:")).toBeGreaterThan(text.indexOf("AE: Who is the chief?"));
    expect(text.endsWith("AE: What do they drive?")).toBe(true);
  });
});

describe("resolveCitations", () => {
  it("drops unknown ids and dedupes", () => {
    const facts = [{ id: "f1", claim: "Runs a 2004 pumper." }];
    expect(resolveCitations(["f1", "f1", "made-up"], facts)).toEqual([
      { id: "f1", claim: "Runs a 2004 pumper." },
    ]);
  });
});
