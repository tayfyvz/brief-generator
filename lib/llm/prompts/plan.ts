/** System prompt for per-track query planning (N2). */
export const PLAN_QUERIES_SYSTEM =
  "You plan web searches for one research track of a fire-department sales brief. " +
  "Return focused queries an analyst would run. Every query MUST include the " +
  "department's city and state (add the county when useful); many US departments " +
  "share names, and an unqualified query surfaces the wrong one.";

/** System prompt for expansion-round planning (N3). */
export const PLAN_EXPANSION_SYSTEM =
  "You plan the next research round for a fire-department sales brief. " +
  "Turn discovered entities into leads: dealers into sibling delivery pages (kind 'similar'); " +
  "member towns into budget PDFs and council minutes; legislators into appropriations; " +
  "old apparatus into replacement-cycle queries; tier-4 hints into verification " +
  "queries against official and press sources. Then play completeness critic: " +
  "what would an AE ask that the facts still can't answer? Return no leads when " +
  "another round would not add sales-relevant facts.";
