import { z } from "zod";
import { getEnv } from "@/lib/env";
import {
  searchResultSchema,
  type SearchResult,
} from "@/lib/schemas/tools";
import { FIXTURE_SEARCH_RESULTS } from "./fixtures";

export interface SearchOptions {
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  /** Restrict to results published within the last N days. */
  days?: number;
}

/** Keyword search (primary, PLAN §1). Stubbed when TAVILY_API_KEY is absent. */
export interface SearchClient {
  search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;
  readonly stubbed: boolean;
}

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().nullish(),
        content: z.string().nullish(),
        score: z.number().nullish(),
        published_date: z.string().nullish(),
      }),
    )
    .default([]),
});

class TavilyClient implements SearchClient {
  readonly stubbed = false;
  constructor(private readonly apiKey: string) {}

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        max_results: opts.maxResults ?? 8,
        include_domains: opts.includeDomains,
        exclude_domains: opts.excludeDomains,
        days: opts.days,
      }),
    });
    if (!res.ok) {
      throw new Error(`Tavily ${res.status}: ${await res.text()}`);
    }
    const parsed = tavilyResponseSchema.parse(await res.json());
    return parsed.results.flatMap((r) => {
      const normalized = searchResultSchema.safeParse({
        url: r.url,
        title: r.title ?? "",
        snippet: r.content ?? "",
        publishedAt: r.published_date ?? undefined,
        score: r.score ?? undefined,
      });
      return normalized.success ? [normalized.data] : [];
    });
  }
}

class StubSearchClient implements SearchClient {
  readonly stubbed = true;

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
    // Naive relevance: rank fixtures by query-term overlap so different
    // track queries surface different fixture pages.
    const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
    const scored = FIXTURE_SEARCH_RESULTS.map((r) => {
      const haystack = `${r.title} ${r.snippet}`.toLowerCase();
      const hits = terms.filter((t) => haystack.includes(t)).length;
      return { r, hits };
    })
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .map((s) => s.r);
    return scored.slice(0, opts.maxResults ?? 8);
  }
}

let client: SearchClient | undefined;

export function getSearchClient(): SearchClient {
  if (client) return client;
  const key = getEnv().TAVILY_API_KEY;
  client = key ? new TavilyClient(key) : new StubSearchClient();
  return client;
}
