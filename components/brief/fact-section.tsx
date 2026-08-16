"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FactCard, type FactRow, type SourceRow } from "./fact-card";
import { scrollToFact, useBriefUiStore } from "@/lib/stores/brief-ui-store";

/**
 * One brief section: curated facts by default, "Show all N findings"
 * expander for the rest. Listens to the brief UI store so a
 * clicked search result can expand the section and scroll to its fact.
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

  // Without a curated pick, preview only the top few facts; a wall of
  // bullets is exactly what the brief exists to avoid.
  const preview = useMemo(
    () => (curated.length > 0 ? curated : rest.slice(0, 4)),
    [curated, rest],
  );
  const hiddenIds = useMemo(() => {
    const previewIds = new Set(preview.map((f) => f.id));
    const hidden = new Set(
      [...curated, ...rest]
        .filter((f) => collapsedByDefault || !previewIds.has(f.id))
        .map((f) => f.id),
    );
    return hidden;
  }, [curated, rest, preview, collapsedByDefault]);
  const ownIds = useMemo(
    () => new Set([...curated, ...rest].map((f) => f.id)),
    [curated, rest],
  );

  // A search result asked for one of our facts: expand if needed, then scroll.
  useEffect(() => {
    if (!revealFactId || !ownIds.has(revealFactId)) return;
    if (hiddenIds.has(revealFactId) && !expanded) setExpanded(true);
    const t = window.setTimeout(() => scrollToFact(revealFactId), 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealFactId, revealNonce]);

  const total = curated.length + rest.length;
  const collapsed = collapsedByDefault && !expanded;
  const shown = collapsed ? [] : expanded ? [...curated, ...rest] : preview;
  const expandable = collapsedByDefault || total > preview.length;

  return (
    <div>
      {shown.length > 0 && (
        <div className="grid gap-2.5">
          {shown.map((fact) => (
            <FactCard key={fact.id} fact={fact} source={sources[fact.sourceId]} />
          ))}
        </div>
      )}
      {expandable && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" />
              {collapsedByDefault ? "Hide" : "Show fewer"}
            </>
          ) : (
            <>
              <ChevronDown className="size-3.5" /> Show all {total} findings
            </>
          )}
        </button>
      )}
    </div>
  );
}
