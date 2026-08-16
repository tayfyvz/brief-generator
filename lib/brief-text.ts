/**
 * Renders a brief as clipboard-ready markdown for pasting into email or a
 * CRM. Mirrors the page: same sections in the same order, numbered source
 * citations so no copied fact loses its provenance.
 */

import { formatDate } from "./format";

export type CopyableBrief = {
  name: string;
  location: string;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  researchedAt: Date;
  summary?: string;
  whyCallToday: { headline: string; detail?: string; date?: string }[];
  sections: {
    title: string;
    emptyNote: string;
    facts: { claim: string; sourceUrl?: string | null }[];
  }[];
  notes: string[];
};

export function briefToMarkdown(brief: CopyableBrief): string {
  const sourceNumbers = new Map<string, number>();
  const cite = (url?: string | null) => {
    if (!url) return "";
    let n = sourceNumbers.get(url);
    if (!n) {
      n = sourceNumbers.size + 1;
      sourceNumbers.set(url, n);
    }
    return ` [${n}]`;
  };

  const lines: string[] = [`# ${brief.name}`];
  const identity = [brief.location, brief.address].filter(Boolean).join(" · ");
  if (identity) lines.push(identity);
  const contact = [
    brief.phone && `Phone: ${brief.phone}`,
    brief.website && `Website: ${brief.website}`,
  ]
    .filter(Boolean)
    .join(" · ");
  if (contact) lines.push(contact);
  lines.push(`Researched ${formatDate(brief.researchedAt.toISOString())}`);

  if (brief.summary) {
    lines.push("", "## At a glance", brief.summary);
  }

  if (brief.whyCallToday.length > 0) {
    lines.push("", "## Why call today");
    brief.whyCallToday.forEach((signal, i) => {
      const date = signal.date ? formatDate(signal.date) : null;
      lines.push(
        `${i + 1}. ${[signal.headline, signal.detail].filter(Boolean).join(" — ")}${date ? ` (${date})` : ""}`,
      );
    });
  }

  for (const section of brief.sections) {
    lines.push("", `## ${section.title}`);
    if (section.facts.length === 0) {
      lines.push(section.emptyNote);
      continue;
    }
    for (const fact of section.facts) {
      lines.push(`- ${fact.claim}${cite(fact.sourceUrl)}`);
    }
  }

  if (brief.notes.length > 0) {
    lines.push("", "## Research notes");
    for (const note of brief.notes) lines.push(`- ${note}`);
  }

  if (sourceNumbers.size > 0) {
    lines.push("", "## Sources");
    for (const [url, n] of sourceNumbers) lines.push(`[${n}] ${url}`);
  }

  return lines.join("\n");
}
