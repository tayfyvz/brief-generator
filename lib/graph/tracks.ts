import type { TrackDef } from "./nodes";

/** The six parallel research tracks (PLAN §3 N2). */
export const TRACKS: TrackDef[] = [
  {
    key: "leadership",
    title: "Leadership & contacts",
    focus:
      "Find who runs the department and who to call: chief and command staff, " +
      "board/committee members with budget authority, executive administrators, " +
      "phone numbers, and office hours.",
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
