"use client";

import { ExternalLink, Quote } from "lucide-react";
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

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-red-500",
};

const TIER_BADGE: Record<number, string> = {
  1: "border-emerald-500/50 text-emerald-700 dark:text-emerald-400",
  2: "border-sky-500/50 text-sky-700 dark:text-sky-400",
  3: "border-zinc-400/60 text-zinc-600 dark:text-zinc-300",
  4: "border-amber-500/50 text-amber-700 dark:text-amber-400",
};

/** Citation chip → popover: the "where'd you hear that" answer in one click. */
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
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Quote className="size-3" />
          <span className="max-w-40 truncate">{host}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[90vw] text-sm">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-snug">
            {source.title ?? host}
          </p>
          {source.tier != null && (
            <Badge variant="outline" className={cn("shrink-0", TIER_BADGE[source.tier])}>
              T{source.tier} · {TIER_LABELS[source.tier]}
            </Badge>
          )}
        </div>
        <blockquote className="mt-2 border-l-2 border-primary/60 pl-3 text-sm leading-relaxed">
          <mark className="bg-amber-100 px-0.5 dark:bg-amber-500/20 dark:text-inherit">
            “{fact.quote}”
          </mark>
        </blockquote>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          {source.fetchedAt && (
            <span>snapshot {formatDate(source.fetchedAt.toISOString())}</span>
          )}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            open source <ExternalLink className="size-3" />
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
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm leading-relaxed">{fact.claim}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {fact.confidence && (
          <span
            className="inline-flex items-center gap-1.5"
            title={`${fact.confidence} confidence`}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                CONFIDENCE_COLOR[fact.confidence] ?? "bg-muted-foreground",
              )}
            />
            {fact.confidence}
          </span>
        )}
        {fact.stale && (
          <Badge
            variant="outline"
            className="border-amber-500/50 text-amber-600 dark:text-amber-400"
          >
            may be stale
          </Badge>
        )}
        {fact.verification === "conflicted" && (
          <Badge
            variant="outline"
            className="border-red-500/50 text-red-600 dark:text-red-400"
          >
            conflicting sources
          </Badge>
        )}
        {fact.asOfDate && <span>as of {formatDate(fact.asOfDate)}</span>}
        {source && <CitationChip fact={fact} source={source} />}
      </div>
    </div>
  );
}
