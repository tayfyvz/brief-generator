import type { Anchor } from "@/lib/schemas/anchor";

/**
 * Page-markdown hygiene, applied once at fetch time so stored content,
 * extraction prompts, and verbatim-quote checks all see the same text.
 * Inline images, <br> tags, and dot leaders on scanned forms are exactly
 * what breaks contiguous label+value quotes (observed: every IRS-990
 * financial fact in a run rejected because the model could only quote the
 * form label, never the amount three <br>s and an image away).
 */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/[​﻿]/g, "")
    .replace(/\.{4,}/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HEAD_CHARS = 40_000;
const TAIL_EXCERPT_CHARS = 15_000;
const EXCERPT_CONTEXT_LINES = 2;

const GENERIC_TERMS = new Set([
  "fire",
  "department",
  "dept",
  "volunteer",
  "rescue",
  "district",
  "protection",
  "company",
  "township",
  "county",
  "station",
  "the",
  "of",
  "and",
]);

/** Distinctive lowercase search terms for a department: name words, city, county. */
export function anchorTerms(anchor: Anchor): string[] {
  const words = [
    ...anchor.name.split(/[^a-zA-Z0-9]+/),
    anchor.city ?? "",
    (anchor.county ?? "").replace(/\s*county\s*$/i, ""),
  ];
  const terms = new Set<string>();
  for (const w of words) {
    const t = w.toLowerCase().trim();
    if (t.length >= 4 && !GENERIC_TERMS.has(t)) terms.add(t);
  }
  return [...terms];
}

/**
 * What the extractor gets to read. Whole page when it fits; for very long
 * pages (statewide news rolls, county budget books) the head plus every
 * later line that mentions the department, with context. A hard slice(0, N)
 * here once cost a dated apparatus update sitting at char 48k of a 95k page.
 */
export function extractionSlice(markdown: string, terms: string[]): string {
  if (markdown.length <= HEAD_CHARS) return markdown;
  const head = markdown.slice(0, HEAD_CHARS);
  const needles = terms.filter((t) => t.length >= 4);
  if (needles.length === 0) return head;

  const lines = markdown.slice(HEAD_CHARS).split("\n");
  const keep = new Set<number>();
  lines.forEach((line, i) => {
    const l = line.toLowerCase();
    if (needles.some((n) => l.includes(n))) {
      const from = Math.max(0, i - EXCERPT_CONTEXT_LINES);
      const to = Math.min(lines.length - 1, i + EXCERPT_CONTEXT_LINES);
      for (let j = from; j <= to; j++) keep.add(j);
    }
  });
  if (keep.size === 0) return head;

  let excerpt = "";
  let prev = -2;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (excerpt.length >= TAIL_EXCERPT_CHARS) break;
    if (i > prev + 1) excerpt += "[...]\n";
    excerpt += `${lines[i]}\n`;
    prev = i;
  }
  return `${head}\n\n## Excerpts from later in this same page that mention the department\n${excerpt}`;
}
