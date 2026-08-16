"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { FactCard, type FactRow, type SourceRow } from "./fact-card";
import { scrollToFact, useBriefUiStore } from "@/lib/stores/brief-ui-store";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 6;

/**
 * One brief section: curated facts by default; "View all" expands into a
 * paginated list so long sections stay scannable. Listens to the brief UI
 * store so a clicked search result can expand the section, flip to the
 * right page, and scroll to its fact.
 */
export function FactSection({
  curated,
  rest,
  sources,
  collapsedByDefault = false,
}: {
  curated: FactRow[];
  rest: FactRow[];
  sources: Record<string, SourceRow>;
  /** Start fully collapsed (used by "Also found"). */
  collapsedByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const revealFactId = useBriefUiStore((s) => s.revealFactId);
  const revealNonce = useBriefUiStore((s) => s.revealNonce);

  const all = useMemo(() => [...curated, ...rest], [curated, rest]);
  // Without a curated pick, preview only the top few facts; a wall of
  // bullets is exactly what the brief exists to avoid.
  const preview = useMemo(
    () => (collapsedByDefault ? [] : curated.length > 0 ? curated : rest.slice(0, 4)),
    [curated, rest, collapsedByDefault],
  );
  const ownIds = useMemo(() => new Set(all.map((f) => f.id)), [all]);
  const previewIds = useMemo(() => new Set(preview.map((f) => f.id)), [preview]);

  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount - 1);

  // A search result asked for one of our facts: expand if needed, flip to
  // the page that holds it, then scroll.
  useEffect(() => {
    if (!revealFactId || !ownIds.has(revealFactId)) return;
    const hidden = !previewIds.has(revealFactId);
    if (hidden) {
      setExpanded(true);
      const idx = all.findIndex((f) => f.id === revealFactId);
      if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE));
    }
    const t = window.setTimeout(() => scrollToFact(revealFactId), 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealFactId, revealNonce]);

  const shown = expanded
    ? all.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)
    : preview;
  const expandable = all.length > preview.length;

  return (
    <div>
      {shown.length > 0 && (
        <div className="grid gap-2.5">
          {shown.map((fact, i) => (
            <div
              key={fact.id}
              className="fade-up"
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <FactCard fact={fact} source={sources[fact.sourceId]} />
            </div>
          ))}
        </div>
      )}

      {(expandable || expanded) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {!expanded ? (
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                setPage(0);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              <ChevronDown className="size-3.5" />
              {collapsedByDefault
                ? `Show ${all.length} background finding${all.length === 1 ? "" : "s"}`
                : `View all ${all.length} findings`}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setPage(0);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="size-3.5" />
                {collapsedByDefault ? "Hide" : "Show fewer"}
              </button>
              {pageCount > 1 && (
                <nav
                  aria-label="Findings pages"
                  className="ml-auto flex items-center gap-1"
                >
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={clampedPage === 0}
                    aria-label="Previous page"
                    className="rounded-lg border bg-card p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  {Array.from({ length: pageCount }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPage(i)}
                      aria-label={`Page ${i + 1}`}
                      aria-current={i === clampedPage ? "page" : undefined}
                      className={cn(
                        "size-7 rounded-lg text-xs font-medium tabular-nums transition",
                        i === clampedPage
                          ? "bg-primary text-primary-foreground"
                          : "border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    disabled={clampedPage === pageCount - 1}
                    aria-label="Next page"
                    className="rounded-lg border bg-card p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </nav>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
