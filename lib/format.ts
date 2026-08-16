/** Small shared formatting helpers for the brief UI. */

export function relativeDays(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export type Freshness = "fresh" | "aging" | "stale";

/** How recently a brief was researched; thresholds match the AE's cadence. */
export function freshness(date: Date | string): Freshness {
  const then = typeof date === "string" ? new Date(date) : date;
  const days = (Date.now() - then.getTime()) / 86_400_000;
  if (days < 7) return "fresh";
  if (days < 30) return "aging";
  return "stale";
}

/**
 * One look per freshness tier, shared by library cards, map pins, and the
 * legend. Emerald/amber match the confidence dots; stale is muted, not red,
 * so old data reads "re-run me", not "wrong".
 */
export const FRESHNESS_META: Record<
  Freshness,
  { dotClass: string; pinFill: string; label: string }
> = {
  // Pin fills are darker than the usual 500-shades so the white-outlined
  // markers separate from OSM's pale greens and beiges.
  fresh: { dotClass: "bg-emerald-600", pinFill: "#059669", label: "within a week" },
  aging: { dotClass: "bg-orange-600", pinFill: "#ea580c", label: "within a month" },
  stale: { dotClass: "bg-slate-500", pinFill: "#475569", label: "older" },
};

export const TIER_LABELS: Record<number, string> = {
  1: "Official",
  2: "Industry",
  3: "Local press",
  4: "Community",
};
