"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { BriefsMap, type BriefPin } from "@/components/briefs-map";
import { FRESHNESS_META } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Map and brief list side by side; the expand toggle grows the map to full
 * width, wrapping the list to a full-width row below it. The list column is
 * a container-query context so its grid re-flows with the panel width.
 *
 * Collapsed on desktop, both panels share one viewport-fit height (100dvh
 * minus the page chrome above and below the explorer), the list scrolls
 * inside its own column, and the pagination stays pinned under it — the page
 * itself never scrolls. Expanded, and on smaller screens, the layout flows
 * and scrolls normally.
 *
 * The height/width animations live on wrapper divs, NOT on the map's own
 * container: React re-applying a changed className to the mounted div would
 * wipe the classes Leaflet added at init (leaflet-container etc.) and blank
 * the tiles.
 */
const PANEL_HEIGHT = "lg:h-[max(30rem,calc(100dvh-21rem))]";

export function BriefsExplorer({
  pins,
  total,
  list,
  pagination,
}: {
  pins: BriefPin[];
  total: number;
  list: React.ReactNode;
  pagination?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-8 flex flex-wrap items-start gap-x-6 gap-y-8">
      <div
        className={cn(
          "flex min-w-0 grow basis-full flex-col transition-[flex-basis] duration-500 ease-in-out motion-reduce:transition-none",
          !expanded && cn("lg:basis-[calc(60%-0.75rem)]", PANEL_HEIGHT),
        )}
      >
        <div
          className={cn(
            "fade-up relative transition-[height] duration-500 ease-in-out motion-reduce:transition-none",
            expanded
              ? "h-[85vh] min-h-[420px]"
              : "h-[60vh] min-h-[420px] lg:h-auto lg:min-h-0 lg:flex-1",
          )}
        >
          <BriefsMap pins={pins} className="h-full min-h-0" />
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-pressed={expanded}
            className="absolute right-3 top-3 z-[1000] inline-flex items-center gap-1.5 rounded-lg border bg-card/95 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur transition hover:bg-accent"
          >
            {expanded ? (
              <>
                <Minimize2 className="size-3.5" />
                Collapse map
              </>
            ) : (
              <>
                <Maximize2 className="size-3.5" />
                Expand map
              </>
            )}
          </button>
        </div>
        <div className="mt-2 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <p className="flex flex-wrap items-center gap-3">
            <span>Researched:</span>
            {(["fresh", "aging", "stale"] as const).map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", FRESHNESS_META[f].dotClass)}
                />
                {FRESHNESS_META[f].label}
              </span>
            ))}
          </p>
          {pins.length < total && (
            <p>
              {total - pins.length} brief{total - pins.length === 1 ? "" : "s"}{" "}
              without coordinates {total - pins.length === 1 ? "is" : "are"}{" "}
              only in the list.
            </p>
          )}
        </div>
      </div>

      <div
        className={cn(
          "@container min-w-0 grow basis-full transition-[flex-basis] duration-500 ease-in-out motion-reduce:transition-none",
          !expanded &&
            cn("lg:flex lg:basis-[calc(40%-0.75rem)] lg:flex-col", PANEL_HEIGHT),
        )}
      >
        <div
          className={cn(
            !expanded &&
              "lg:-mr-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-2",
          )}
        >
          {list}
        </div>
        {pagination && (
          <div
            className={cn(
              "mt-6",
              !expanded && "lg:mt-3 lg:shrink-0 lg:border-t lg:pt-3",
            )}
          >
            {pagination}
          </div>
        )}
      </div>
    </div>
  );
}
