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
 * The height/width animations live on wrapper divs, NOT on the map's own
 * container: React re-applying a changed className to the mounted div would
 * wipe the classes Leaflet added at init (leaflet-container etc.) and blank
 * the tiles.
 */
export function BriefsExplorer({
  pins,
  total,
  children,
}: {
  pins: BriefPin[];
  total: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-8 flex flex-wrap items-start gap-x-6 gap-y-8">
      <div
        className={cn(
          "min-w-0 grow basis-full transition-[flex-basis] duration-500 ease-in-out motion-reduce:transition-none",
          !expanded && "lg:basis-[calc(60%-0.75rem)]",
        )}
      >
        <div
          className={cn(
            "fade-up relative min-h-[420px] transition-[height] duration-500 ease-in-out motion-reduce:transition-none",
            expanded ? "h-[85vh]" : "h-[60vh]",
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
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-muted-foreground">
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
          !expanded && "lg:basis-[calc(40%-0.75rem)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
