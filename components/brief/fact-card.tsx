"use client";

import { useState } from "react";
import { CalendarDays, ExternalLink, Quote, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatDate, TIER_LABELS } from "@/lib/format";
import type { facts, sources } from "@/lib/db/schema";

export type FactRow = typeof facts.$inferSelect;
export type SourceRow = Omit<typeof sources.$inferSelect, "contentMd">;

const CONFIDENCE_STYLE: Record<string, { dot: string; label: string }> = {
  high: { dot: "bg-emerald-500", label: "high confidence" },
  medium: { dot: "bg-amber-500", label: "medium confidence" },
  low: { dot: "bg-red-500", label: "low confidence" },
};

const TIER_BADGE: Record<number, string> = {
  1: "border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
  2: "border-sky-500/50 bg-sky-500/5 text-sky-700 dark:text-sky-400",
  3: "border-zinc-400/60 bg-zinc-400/5 text-zinc-600 dark:text-zinc-300",
  4: "border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400",
};

const QUOTE_CLAMP_CHARS = 280;

/** Long source quotes start clamped with a "show full quote" expander. */
function ExpandableQuote({ quote }: { quote: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = quote.length > QUOTE_CLAMP_CHARS;
  const shown = long && !expanded ? `${quote.slice(0, QUOTE_CLAMP_CHARS)}…` : quote;

  return (
    <>
      <blockquote className="mt-2 border-l-2 border-primary/60 pl-3 text-sm leading-relaxed">
        <mark className="bg-amber-100 px-0.5 dark:bg-amber-500/20 dark:text-inherit">
          “{shown}”
        </mark>
      </blockquote>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1.5 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "Show full quote"}
        </button>
      )}
    </>
  );
}

/** Citation chip and popover: the "where'd you hear that" answer in one click. */
export function CitationChip({
  fact,
  source,
}: {
  fact: Pick<FactRow, "quote">;
  source: SourceRow;
}) {
  const host = (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "");
    } catch {
      return source.url;
    }
  })();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
          title="See the exact quote and source"
        >
          <Quote className="size-3" />
          <span className="max-w-40 truncate">{host}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[90vw] text-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-snug">{source.title ?? host}</p>
          {source.tier != null && (
            <Badge
              variant="outline"
              className={cn("shrink-0", TIER_BADGE[source.tier])}
            >
              {TIER_LABELS[source.tier] ?? `Tier ${source.tier}`}
            </Badge>
          )}
        </div>
        <ExpandableQuote quote={fact.quote} />
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          {source.fetchedAt && (
            <span>snapshot {formatDate(source.fetchedAt.toISOString())}</span>
          )}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5"
          >
            Open source <ExternalLink className="size-3" />
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FactCard({
  fact,
  source,
}: {
  fact: FactRow;
  source: SourceRow | undefined;
}) {
  const keyFact = fact.usefulness === "high";
  const confidence = fact.confidence
    ? CONFIDENCE_STYLE[fact.confidence]
    : undefined;

  return (
    <div
      id={`fact-${fact.id}`}
      className={cn(
        "scroll-mt-28 rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm",
        keyFact && "border-primary/25 bg-primary/[0.03]",
      )}
    >
      <div className="flex items-start gap-2">
        {keyFact && (
          <span
            className="mt-1 shrink-0 text-primary"
            title="Key fact — most useful for an AE"
          >
            <Star className="size-3.5 fill-current" />
          </span>
        )}
        <p className="text-sm leading-relaxed">{fact.claim}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-muted-foreground">
        {confidence && (
          <span className="inline-flex items-center gap-1.5" title={confidence.label}>
            <span className={cn("size-1.5 rounded-full", confidence.dot)} />
            {fact.confidence}
          </span>
        )}
        {source?.tier != null && source.tier >= 4 && (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          >
            community source, unconfirmed
          </Badge>
        )}
        {fact.stale && (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          >
            may be stale
          </Badge>
        )}
        {fact.verification === "conflicted" && (
          <Badge
            variant="outline"
            className="border-amber-500/50 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          >
            conflicting sources
          </Badge>
        )}
        {fact.asOfDate && (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3" /> as of {formatDate(fact.asOfDate)}
          </span>
        )}
        <span className="ml-auto">
          {source && <CitationChip fact={fact} source={source} />}
        </span>
      </div>
    </div>
  );
}
