"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FactCard, type FactRow, type SourceRow } from "./fact-card";

/**
 * One brief section: curated facts by default, "Show all N findings"
 * expander for the rest (PLAN §6).
 */
export function FactSection({
  curated,
  rest,
  sources,
}: {
  curated: FactRow[];
  rest: FactRow[];
  sources: Record<string, SourceRow>;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = curated.length + rest.length;
  const shown = expanded ? [...curated, ...rest] : curated.length > 0 ? curated : rest;

  return (
    <div>
      <div className="grid gap-3">
        {shown.map((fact) => (
          <FactCard key={fact.id} fact={fact} source={sources[fact.sourceId]} />
        ))}
      </div>
      {rest.length > 0 && curated.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3.5" /> Show curated only
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
