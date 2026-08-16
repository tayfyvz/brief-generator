/** Staleness flagging: facts older than ~18 months get a badge. */

export const STALE_AFTER_MONTHS = 18;

export function isStale(asOfDate: string | null, now: Date = new Date()): boolean {
  if (!asOfDate) return false;
  const then = new Date(asOfDate);
  if (Number.isNaN(then.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - STALE_AFTER_MONTHS);
  return then < cutoff;
}
