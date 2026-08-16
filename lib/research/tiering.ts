/**
 * Source trust tiers. Heuristic by domain/URL; the playbook prompt
 * gives the LLM the same taxonomy. Conflicts resolve toward lower tier
 * numbers; tier 4 generates leads but never sole citations.
 */

const T1_PATTERNS = [
  /\.gov(\/|$)/,
  /\.us(\/|$)/,
  /ecode360\.com/,
  /granicus\.com/,
  /civicclerk\.com/,
  /civicplus\.com/,
  /legistar\.com/,
  /municode\.com/,
  /usfa\.fema\.gov/,
  /fema\.gov/,
  /senate\.gov/,
  /house\.gov/,
];

const T2_PATTERNS = [
  /piercemfg\.com/,
  /ferrarafire\.com/,
  /e-one\.com/,
  /sutphen\.com/,
  /seagrave\.com/,
  /rosenbaueramerica\.com/,
  /revgroup\.com/,
  /fireapparatusmagazine\.com/,
  /firehouse\.com/,
  /fireapparatus\.com/,
  /firefighterone\.com/,
  /fire-safety\.com/,
  /firenews\.com/,
];

const T4_PATTERNS = [
  /fandom\.com/,
  /stationboss\.com/,
  /youtube\.com/,
  /youtu\.be/,
  /facebook\.com/,
  /instagram\.com/,
  /x\.com/,
  /twitter\.com/,
  /reddit\.com/,
  /firepics/,
  /forums?\./,
];

/** Official department/municipal sites are T1 even on .org/.com domains. */
const T1_HINTS = [/fire.*(dept|department|rescue)/, /nhrfr/, /\bfd\b/];

export function tierForUrl(url: string, officialDomains: string[] = []): number {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 4;
  }
  const full = url.toLowerCase();

  if (officialDomains.some((d) => host === d || host.endsWith(`.${d}`))) return 1;
  if (T1_PATTERNS.some((p) => p.test(full))) return 1;
  if (T4_PATTERNS.some((p) => p.test(full))) return 4;
  if (T2_PATTERNS.some((p) => p.test(full))) return 2;
  if (T1_HINTS.some((p) => p.test(host))) return 1;
  // Unknown domains default to local-press trust: usable, verified upward.
  return 3;
}
