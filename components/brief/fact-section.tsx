"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FactCard, type FactRow, type SourceRow } from "./fact-card";
import { scrollToFact, useBriefUiStore } from "@/lib/stores/brief-ui-store";

/**
 * One brief section: curated facts by default, "View all N findings"
 * expander for the rest. Listens to the brief UI store so a clicked search
 * result can expand the section and scroll to its fact.
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

  // A search result asked for one of our facts: expand if needed, then scroll.
  useEffect(() => {
    if (!revealFactId || !ownIds.has(revealFactId)) return;
    if (!previewIds.has(revealFactId)) setExpanded(true);
    const t = window.setTimeout(() => scrollToFact(revealFactId), 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealFactId, revealNonce]);

  const shown = expanded ? all : preview;
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
      {expandable && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" />
              {collapsedByDefault ? "Hide" : "Show fewer"}
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" />
              {collapsedByDefault
                ? `Show ${all.length} background finding${all.length === 1 ? "" : "s"}`
                : `View all ${all.length} findings`}
            </>
          )}
        </button>
      )}
    </div>
  );
}
