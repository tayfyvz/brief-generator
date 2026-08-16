import type { Anchor } from "@/lib/schemas/anchor";
import type { ExtractedFact } from "@/lib/schemas/llm";

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

/** Verbatim-quote extractions keyed by fixture URL (quotes exist in fixtures.ts). */
const FIXTURE_EXTRACTIONS: Record<string, ExtractedFact[]> = {
  "https://www.nhrfr.org/about": [
    {
      category: "leadership",
      tags: ["chief"],
      claim: "The Chief of Department is David Donnarumma.",
      quote: "Chief of Department: David Donnarumma.",
      asOfDate: null,
      confidence: "high",
      usefulness: "high",
    },
    {
      category: "leadership",
      tags: ["board", "budget-authority"],
      claim:
        "Weehawken Mayor Richard Turner chairs the NHRFR Management Committee.",
      quote:
        "Weehawken Mayor Richard Turner serves as Chairman of the NHRFR Management Committee.",
      asOfDate: null,
      confidence: "high",
      usefulness: "high",
    },
    {
      category: "leadership",
      tags: ["administration"],
      claim:
        "Co-Executive Directors Michael DeOrio and Jeff Welz oversee executive administration.",
      quote:
        "Executive administration is overseen by Co-Executive Directors Michael DeOrio and Jeff Welz.",
      asOfDate: null,
      confidence: "high",
      usefulness: "high",
    },
    {
      category: "leadership",
      tags: ["contact", "phone"],
      claim:
        "Administrative HQ (Reports & Records) is reachable at (201) 601-3542, 11 Port Imperial Blvd, West New York, NJ.",
      quote:
        "Administrative HQ (Reports & Records): (201) 601-3542; 11 Port Imperial Blvd,",
      asOfDate: null,
      confidence: "high",
      usefulness: "high",
    },
    {
      category: "other",
      tags: ["governance", "regional"],
      claim:
        "NHRFR is a consolidated regional department serving Weehawken, Union City, West New York, North Bergen and Guttenberg.",
      quote:
        "NHRFR serves Weehawken, Union City, West New York, North Bergen and Guttenberg,",
      asOfDate: null,
      confidence: "high",
      usefulness: "high",
    },
  ],
  "https://www.fire-safety.com/deliveries/north-hudson-regional": [
    {
      category: "fleet",
      tags: ["tiller", "pierce"],
      claim:
        "Ladder 4 is a 2018 Pierce Arrow XT 100' tiller (job #31983), delivered November 2018.",
      quote:
        "Delivered November 2018: Pierce Arrow XT 100' tiller (job #31983), Detroit DD13",
      asOfDate: "2018-11-15",
      confidence: "high",
      usefulness: "high",
    },
    {
      category: "fleet",
      tags: ["pumper", "pierce", "frontline"],
      claim:
        "Engine 5 in Weehawken runs a 2015 Pierce Saber custom pumper with a 1,500 GPM Waterous pump.",
      quote:
        "In service since 2015: Pierce Saber custom pumper; 1,500 GPM Waterous pump,",
      asOfDate: null,
      confidence: "high",
      usefulness: "high",
    },
    {
      category: "procurement",
      tags: ["dealer"],
      claim:
        "Fire & Safety Services, Ltd. is the exclusive Pierce dealer for New Jersey.",
      quote:
        "Fire & Safety Services, Ltd. is the exclusive Pierce Manufacturing dealer for New Jersey.",
      asOfDate: null,
      confidence: "high",
      usefulness: "high",
    },
  ],
  "https://www.firefighterone.com/deliveries/nhrfr-inferno-102": [
    {
      category: "fleet",
      tags: ["aerial", "ferrara", "delivery"],
      claim:
        "Ladder 5 is a 2024 Ferrara Inferno 102' rear-mount aerial placed in service in 2024.",
      quote:
        "NHRFR placed the 2024 Ferrara Inferno 102' rear-mount aerial in service as Ladder 5,",
      asOfDate: "2024-06-01",
      confidence: "high",
      usefulness: "high",
    },
    {
      category: "fleet",
      tags: ["replacement-cycle", "tiller", "opportunity"],
      claim:
        "Ladder 1's 2008 Pierce Arrow XT 100-foot tiller is scheduled for evaluation and potential replacement.",
      quote: "are scheduled for evaluation and potential replacement",
      asOfDate: "2024-06-01",
      confidence: "medium",
      usefulness: "high",
    },
    {
      category: "procurement",
      tags: ["dealer"],
      claim:
        "Firefighter One, LLC represents Ferrara Fire Apparatus and the REV Group in the region.",
      quote:
        "Firefighter One, LLC represents Ferrara Fire Apparatus and the REV Group in the region.",
      asOfDate: null,
      confidence: "high",
      usefulness: "high",
    },
  ],
  "https://www.kim.senate.gov/appropriations/cds-fy2026": [
    {
      category: "funding",
      tags: ["federal", "cds", "facilities"],
      claim:
        "NHRFR has a $1,410,000 Congressionally Directed Spending request for its Firehouse Modernization and Safety Upgrades Project.",
      quote: "Upgrades Project; $1,410,000. Sponsored with Rep. Rob Menendez under the",
      asOfDate: "2025-05-20",
      confidence: "high",
      usefulness: "high",
    },
  ],
  "https://hudsoncountyview.com/nhrfr-swears-in-chief-donnarumma": [
    {
      category: "leadership",
      tags: ["chief", "appointment"],
      claim:
        "David Donnarumma, a 30-year veteran, was sworn in as Chief of Department in September 2022.",
      quote:
        "David Donnarumma, a 30-year veteran of the regional fire service, was sworn in as",
      asOfDate: "2022-09-14",
      confidence: "high",
      usefulness: "high",
    },
    {
      category: "news",
      tags: ["leadership-change"],
      claim:
        "Donnarumma took over following Acting Chief Michael Falco and retired Chief Frank Montagne.",
      quote:
        "of Acting Chief Michael Falco and retired Chief Frank Montagne.",
      asOfDate: "2022-09-14",
      confidence: "medium",
      usefulness: "high",
    },
  ],
};

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
