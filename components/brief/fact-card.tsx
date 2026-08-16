import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                CONFIDENCE_COLOR[fact.confidence] ?? "bg-muted-foreground",
              )}
            />
            {fact.confidence} confidence
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
        {fact.asOfDate && <span>as of {formatDate(fact.asOfDate)}</span>}
        {source && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition hover:bg-accent hover:text-foreground"
            title={fact.quote ? `“${fact.quote}”` : undefined}
          >
            {source.tier ? TIER_LABELS[source.tier] : "Source"}
            <span className="max-w-48 truncate">
              {source.title ?? new URL(source.url).hostname}
            </span>
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}
