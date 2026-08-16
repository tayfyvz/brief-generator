"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownRight, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBriefUiStore } from "@/lib/stores/brief-ui-store";

interface SearchResult {
  id: string;
  category: string;
  claim: string;
  quote: string;
}

/** Render ⟦…⟧ highlight markers from ts_headline as <mark>; no raw HTML. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/⟦|⟧/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-amber-100 px-0.5 dark:bg-amber-500/25 dark:text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * Fact quick-find (press "/" to focus): FTS over claim/quote/tags. Clicking
 * a result jumps to that fact card on the page (expanding its section if the
 * fact is behind "Show all").
 */
export function FactSearch({ placeId }: { placeId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const revealFact = useBriefUiStore((s) => s.revealFact);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/brief/${placeId}/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (res.ok) {
          const data = (await res.json()) as { results: SearchResult[] };
          setResults(data.results);
        }
      } catch {
        // aborted or offline; keep previous results
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, placeId]);

  return (
    // Sticky: the search follows the reader down the brief, sitting just
    // under the top header (and under the mobile section-chip nav).
    <div className="sticky top-[6.375rem] z-20 -my-1 mt-5 bg-background/95 py-2 backdrop-blur lg:top-[3.625rem]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search the findings, e.g. "pumper" or "grant" (press / to focus)'
          className="h-9 w-full rounded-lg border bg-card pl-9 pr-9 text-sm shadow-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-ring/40"
          aria-label="Search facts"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {results && (
        <div className="fade-up absolute left-0 right-0 top-full z-30 max-h-[55vh] overflow-y-auto rounded-xl border bg-card shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No findings match “{query}”.
            </p>
          ) : (
            <ul className="divide-y">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setResults(null);
                      revealFact(r.id);
                    }}
                    className="group flex w-full items-start gap-2 px-4 py-3 text-left text-sm transition hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1">
                      <Badge variant="secondary" className="mr-2 align-middle">
                        {r.category}
                      </Badge>
                      <Highlighted text={r.claim} />
                      <span className="mt-1 block text-xs text-muted-foreground">
                        “<Highlighted text={r.quote} />”
                      </span>
                    </span>
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100">
                      <CornerDownRight className="size-3" /> jump to fact
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
