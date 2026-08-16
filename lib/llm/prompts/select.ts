/**
 * Relevance gate over search results (the fetch budget is the scarcest
 * resource): a cheap low-effort call picks which URLs deserve a fetch.
 * Observed failure mode without it: "Lexington" queries burning the whole
 * budget on Lexington KY/IL/TN pages and 200KB out-of-scope PDFs, leaving
 * zero fetches for the expansion round.
 */
export const SELECT_RESULTS_SYSTEM = [
  "You triage web search results for a fire-department research pipeline.",
  "Pick ONLY the URLs genuinely worth fetching for the anchored department.",
  "Reject without mercy:",
  "results about similarly-named departments or places in a different city,",
  "county, or state than the anchor (check the URL domain and the snippet;",
  "a .gov domain of the wrong state or city is an automatic reject);",
  "bulk documents where the department would be one line among thousands",
  "(statewide budget archives, old appropriation lists, mutual-aid rosters);",
  "pages more than a decade old with no bearing on the current fleet or budget;",
  "generic advice, product marketing, or directory spam.",
  "Prefer: the department's own pages, its municipality/township/county,",
  "meeting minutes and budgets naming it, dealer/manufacturer delivery pages",
  "about it, local press about it, and its social media or wiki pages.",
  "Return the urls best-first; return an empty list when nothing qualifies.",
].join("\n");
