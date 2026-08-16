/**
 * Source playbook (PLAN §4) — a prompt asset injected into every research
 * track. Trust tiers resolve conflicts upward; Tier 4 generates leads but
 * never sole citations. Guidance, not a fence.
 */
export const SOURCE_PLAYBOOK = `
## Source playbook — where good facts live

Trust tiers (conflicts resolve toward lower tier numbers; tier 4 is
leads-only — never cite it as the sole source of a fact):

**Tier 1 — authoritative:** the department's own site; municipal/county sites;
state procurement portals; budgets, audits, CAFRs, bond ordinances; council
agendas & minutes (ecode360, Granicus, CivicClerk); federal appropriations
tables; FEMA AFG/SAFER award lists; the USFA fire department registry.

**Tier 2 — industry:** manufacturer new-delivery pages (Pierce, Ferrara,
E-ONE, Sutphen, Seagrave, Rosenbauer...); regional dealer delivery pages;
Fire Apparatus Magazine; Firehouse.com.

**Tier 3 — local press:** local news sites, county/regional outlets.

**Tier 4 — leads only:** fire.fandom.com, stationboss, YouTube, Facebook,
forums, enthusiast photo sites. Use these to discover unit numbers, apparatus
years, and station assignments to verify against tier 1–3 sources.

Prefer these source *types* but pursue anything relevant. Always discard
sources about similarly-named departments in other places — verify the
city/county/state matches the anchor before trusting a page.
`.trim();
