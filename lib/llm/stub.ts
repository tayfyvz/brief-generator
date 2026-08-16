import { FIXTURE_EXTRACTIONS } from "@/lib/tools/fixtures";
import type { Anchor } from "@/lib/schemas/anchor";

/**
 * Deterministic LLM stub (no ANTHROPIC_API_KEY). Dispatches on task name and
 * consumes the structured `context` payload directly. Paired with the fixture
 * search/fetch stubs so the whole pipeline runs end-to-end offline on the
 * Weehawken sample Place ID.
 */

interface PlanQueriesContext {
  track: string;
  anchor: Anchor;
  orgName: string;
}

interface ExtractFactsContext {
  page: { url: string; markdown: string };
}

interface SynthesizeContext {
  facts: {
    id: string;
    category: string;
    claim: string;
    asOfDate: string | null;
    tags: string[];
  }[];
}

const TRACK_QUERY_TEMPLATES: Record<string, (org: string, anchor: Anchor) => string[]> = {
  leadership: (org, anchor) => [
    `${org} chief of department leadership`,
    `${org} board directors administration contact`,
    `${anchor.city ?? ""} fire department chief sworn in`.trim(),
  ],
  fleet: (org) => [
    `${org} fire apparatus deliveries Pierce Ferrara`,
    `${org} engine ladder pumper in service`,
  ],
  procurement: (org) => [
    `${org} apparatus dealer bid purchase`,
    `${org} Pierce Ferrara dealer New Jersey`,
  ],
  funding: (org) => [
    `${org} appropriations grant congressionally directed spending`,
    `${org} budget capital firehouse modernization`,
  ],
  news: (org) => [`${org} fire news 2024 2025`, `${org} sworn in delivered`],
  other: (org) => [`${org} regional fire rescue about`],
};

export function getStubStructuredOutput(task: string, context: unknown): unknown {
  switch (task) {
    case "resolveEntity": {
      return {
        entities: [
          {
            kind: "parent_org",
            name: "North Hudson Regional Fire and Rescue",
            note: "Consolidated regional department (1999) operating this station; purchases apparatus regionally.",
            relations: [
              "operates the Weehawken fire stations",
              "governed by a joint Management Committee of five member municipalities",
            ],
          },
          { kind: "municipality", name: "Township of Weehawken" },
          { kind: "municipality", name: "City of Union City" },
          { kind: "municipality", name: "Township of North Bergen" },
          { kind: "municipality", name: "Town of West New York" },
          { kind: "municipality", name: "Town of Guttenberg" },
          {
            kind: "dealer",
            name: "Fire & Safety Services, Ltd.",
            note: "Pierce Manufacturing dealer for New Jersey",
          },
          {
            kind: "dealer",
            name: "Firefighter One, LLC",
            note: "Ferrara / REV Group dealer",
          },
        ],
        officialDomains: ["nhrfr.org"],
        buyerSummary:
          "Apparatus is purchased by North Hudson Regional Fire and Rescue (NHRFR), the regional consolidation this station belongs to; not by Weehawken alone.",
      };
    }
    case "planQueries": {
      const ctx = context as PlanQueriesContext;
      const template = TRACK_QUERY_TEMPLATES[ctx.track] ?? TRACK_QUERY_TEMPLATES.other;
      return { queries: template(ctx.orgName, ctx.anchor).filter(Boolean) };
    }
    case "extractFacts": {
      const ctx = context as ExtractFactsContext;
      return { facts: FIXTURE_EXTRACTIONS[ctx.page.url] ?? [] };
    }
    case "verifyFacts": {
      const ctx = context as { facts: { id: string }[] };
      return {
        verdicts: ctx.facts.map((f) => ({ factId: f.id, verdict: "supported" })),
        duplicates: [],
        conflicts: [],
      };
    }
    case "selectResults": {
      // Offline fixtures are all relevant: keep the naive top-N behavior.
      const ctx = context as { results: { url: string }[]; max: number };
      return { urls: ctx.results.slice(0, ctx.max).map((r) => r.url) };
    }
    case "planExpansion": {
      const ctx = context as { round: number };
      if (ctx.round <= 1) {
        return {
          leads: [
            {
              kind: "similar",
              query: "https://www.firefighterone.com/deliveries/nhrfr-inferno-102",
              reason: "Dealer delivery page; find sibling delivery pages for the same department.",
            },
            {
              kind: "search",
              query: "NHRFR capital budget bond ordinance fire apparatus",
              reason: "Member-town capital budgets fund apparatus purchases.",
            },
          ],
          criticNote:
            "An AE would still ask: is there an active bid or a budgeted apparatus line item for next fiscal year?",
        };
      }
      return {
        leads: [],
        criticNote: "No further productive leads; coverage looks complete for offline fixtures.",
      };
    }
    case "synthesize": {
      const ctx = context as SynthesizeContext;
      const byCategory = (cats: string[]) =>
        ctx.facts.filter((f) => cats.includes(f.category)).map((f) => f.id);
      const funding = ctx.facts.find((f) => f.category === "funding");
      const replacement = ctx.facts.find((f) =>
        f.tags.includes("replacement-cycle"),
      );
      const delivery = ctx.facts.find((f) => f.tags.includes("delivery"));
      const whyCallToday = [replacement, funding, delivery]
        .filter((f): f is NonNullable<typeof f> => Boolean(f))
        .map((f) => ({
          headline: f.claim,
          date: f.asOfDate ?? undefined,
          factIds: [f.id],
        }));
      return {
        summary:
          "Apparatus decisions for this station are made regionally by NHRFR. The fleet is mid-modernization, an aging tiller is up for replacement, and a federal facilities request signals active capital appetite.",
        whyCallToday,
        curated: {
          leadership: byCategory(["leadership"]).slice(0, 4),
          fleet: byCategory(["fleet"]).slice(0, 4),
          money: byCategory(["procurement", "funding"]).slice(0, 4),
          news: byCategory(["news"]).slice(0, 3),
        },
        conflicts: [],
        caveats: [
          "Generated by the offline stub pipeline; verify against live sources once API keys are configured.",
        ],
      };
    }
    default:
      throw new Error(`Stub LLM has no handler for task "${task}"`);
  }
}
