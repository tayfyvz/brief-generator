import type { TrackDef } from "./nodes";

const place = (a: { city?: string; state?: string }) =>
  [a.city, a.state].filter(Boolean).join(" ");

/** The six parallel research tracks. */
export const TRACKS: TrackDef[] = [
  {
    key: "leadership",
    title: "Leadership & contacts",
    focus:
      "Find who runs the department and who to call: chief and command staff, " +
      "board/committee members with budget authority, executive administrators, " +
      "phone numbers, and office hours.",
    seedQueries: (a) => [`${place(a)} fire chief ${a.name}`],
  },
  {
    key: "fleet",
    title: "Fleet & apparatus",
    focus:
      "Inventory what they drive: engines, ladders, tillers, squads, rescues; " +
      "year, make, model, pump/tank specs, unit assignments. Note apparatus age: " +
      "rigs older than ~15 years signal a coming replacement purchase.",
  },
  {
    key: "procurement",
    title: "Procurement & bids",
    focus:
      "Find how and where they buy: dealers and manufacturer relationships, open " +
      "or recent bids and RFPs, purchasing cooperatives (Sourcewell, HGACBuy), " +
      "bid tabulations, award resolutions.",
  },
  {
    key: "funding",
    title: "Budgets, grants & capital",
    focus:
      "Follow the money: capital budgets and bond ordinances for apparatus, " +
      "FEMA AFG/SAFER awards, congressionally directed spending, state grants, " +
      "council minutes approving purchases; with amounts, dates, and status.",
    // Nearly every US volunteer department files a Form 990; local community
    // foundations publish their fire-equipment grants. Both surfaced real
    // money data for a department with no web presence of its own.
    seedQueries: (a) => [
      `${a.name} ${place(a)} IRS Form 990 ProPublica`,
      `${[a.county, a.state].filter(Boolean).join(" ")} community foundation grant fire department ${a.city ?? ""}`.trim(),
    ],
  },
  {
    key: "news",
    title: "News & signals",
    focus:
      "Recent department news an AE can open a call with: leadership changes, " +
      "station projects, new deliveries and retirements, incidents driving " +
      "equipment needs, anniversaries and milestones.",
  },
  {
    key: "discovery",
    title: "Open discovery",
    focus:
      "Catch-all: anything sales-relevant the named tracks would miss; " +
      "consolidation politics, staffing changes, mutual-aid arrangements, " +
      "facility conditions. File findings under category 'other' with tags; " +
      "never drop something just because it doesn't fit a category.",
  },
];
