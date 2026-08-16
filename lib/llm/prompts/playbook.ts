/**
 * Source playbook; a prompt asset injected into every research track.
 * Trust tiers resolve conflicts upward; tier 4 is citable as clearly-labeled
 * community data, superseded by any tier 1-3 source carrying the same datum.
 * Guidance, not a fence.
 */
export const SOURCE_PLAYBOOK = `
## Source playbook; where good facts live

Trust tiers (conflicts resolve toward lower tier numbers; tier 4 facts are
citable but render as unconfirmed community data and are superseded whenever
a tier 1-3 source carries the same datum):

**Tier 1; authoritative:** the department's own site; municipal/county sites;
city council and town board agendas & minutes (ecode360, Granicus, CivicClerk);
township trustee and select board pages; annual town reports; county
commissioners and county EMA pages; state transparency and budget portals
(e.g. Indiana Gateway, state comptroller sites); state fire marshal pages;
state procurement portals; budgets, audits, CAFRs, bond ordinances; federal
appropriations tables; FEMA AFG/SAFER award lists; the USFA fire department
registry. Council/city/county documents are gold: they record apparatus
purchase approvals, loan authorizations, and fire budget lines that never
appear on the department's own site. On state budget portals (Indiana
Gateway, budgetnotices.in.gov and peers) look up the TOWNSHIP or fire
district unit that actually funds the department; the county unit is
mostly sheriff and highway lines. IRS Form 990 filings (ProPublica
Nonprofit Explorer) reveal a volunteer department's revenue, fund balance,
and legal purchasing entity.

**Tier 2; industry:** manufacturer new-delivery pages (Pierce, Ferrara,
E-ONE, Sutphen, Seagrave, Rosenbauer...); regional dealer delivery pages;
Fire Apparatus Magazine; Firehouse.com.

**Tier 3; local press & directories:** local news sites, county/regional
outlets; national fire-department directories (usfiredept.com, firenews.org
and similar) are also tier 3 and often YEARS stale; never trust a directory
over a fresher source.

**Tier 4; community:** fire.fandom.com, stationboss, YouTube, Facebook,
forums, enthusiast photo sites. For small volunteer departments these often
hold the only apparatus roster on the web; extract the concrete data (unit
numbers, years, makes, models) and try to confirm it against tier 1-3.

Prefer these source *types* but pursue anything relevant. Always discard
sources about similarly-named departments in other places; verify the
city/county/state matches the anchor before trusting a page.
`.trim();
