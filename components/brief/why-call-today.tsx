"use client";

import { CornerDownRight } from "lucide-react";
import { useBriefUiStore } from "@/lib/stores/brief-ui-store";
import { formatDate } from "@/lib/format";

export interface SignalItem {
  headline: string;
  detail?: string;
  date?: string;
  /** Cited facts rendered elsewhere on the page; label is the fact's claim. */
  related: { id: string; label: string }[];
}

/**
 * "Why call today" list. Each signal's cited facts become jump links: click
 * one and the owning section expands, scrolls to the fact card, and flashes
 * it (same reveal mechanism the fact search uses).
 */
export function WhyCallToday({ signals }: { signals: SignalItem[] }) {
  const revealFact = useBriefUiStore((s) => s.revealFact);

  return (
    <ol className="grid gap-3 xl:grid-cols-3">
      {signals.map((signal, i) => (
        <li
          key={i}
          className="fade-up flex gap-4 rounded-xl border-l-4 border-primary bg-card p-4 shadow-sm"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold tabular-nums text-primary-foreground">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{signal.headline}</p>
            {signal.detail && (
              <p className="mt-1 text-sm text-muted-foreground">{signal.detail}</p>
            )}
            {signal.date && (
              <p className="mt-1.5 text-xs font-medium text-primary/80">
                {formatDate(signal.date)}
              </p>
            )}
            {signal.related.length > 0 && (
              <div className="mt-2.5 flex flex-col items-start gap-1">
                {signal.related.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => revealFact(r.id)}
                    title="Jump to this fact in the brief"
                    className="chip-hover inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
                  >
                    <CornerDownRight className="size-3 shrink-0 text-primary" />
                    <span className="truncate">{r.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
