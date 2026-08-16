import { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { searchResultSchema, type SearchResult } from "@/lib/schemas/tools";
import { FIXTURE_SEARCH_RESULTS } from "./fixtures";

/**
 * Exa semantic search / find-similar — expansion phase only (PLAN §1):
 * discovery of dealer delivery pages and obscure gov PDFs that keyword
 * search misses. Stubbed when EXA_API_KEY is absent.
 */
export interface SimilarityClient {
  findSimilar(url: string, maxResults?: number): Promise<SearchResult[]>;
  searchSemantic(query: string, maxResults?: number): Promise<SearchResult[]>;
  readonly stubbed: boolean;
}

const exaResponseSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string(),
        title: z.string().nullish(),
        publishedDate: z.string().nullish(),
        text: z.string().nullish(),
        score: z.number().nullish(),
      }),
    )
    .default([]),
});

class ExaClient implements SimilarityClient {
  readonly stubbed = false;
  constructor(private readonly apiKey: string) {}

  private async post(path: string, body: Record<string, unknown>): Promise<SearchResult[]> {
    const res = await fetch(`https://api.exa.ai${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Exa ${res.status}: ${await res.text()}`);
    const parsed = exaResponseSchema.parse(await res.json());
    return parsed.results.flatMap((r) => {
      const normalized = searchResultSchema.safeParse({
        url: r.url,
        title: r.title ?? "",
        snippet: r.text?.slice(0, 400) ?? "",
        publishedAt: r.publishedDate ?? undefined,
        score: r.score ?? undefined,
      });
      return normalized.success ? [normalized.data] : [];
    });
  }

  findSimilar(url: string, maxResults = 5): Promise<SearchResult[]> {
    return this.post("/findSimilar", { url, numResults: maxResults });
  }

  searchSemantic(query: string, maxResults = 5): Promise<SearchResult[]> {
    return this.post("/search", { query, type: "auto", numResults: maxResults });
  }
}

class StubSimilarityClient implements SimilarityClient {
  readonly stubbed = true;

  async findSimilar(url: string, maxResults = 5): Promise<SearchResult[]> {
    return FIXTURE_SEARCH_RESULTS.filter((r) => r.url !== url).slice(0, maxResults);
  }

  async searchSemantic(query: string, maxResults = 5): Promise<SearchResult[]> {
    const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
    return FIXTURE_SEARCH_RESULTS.filter((r) =>
      terms.some((t) => `${r.title} ${r.snippet}`.toLowerCase().includes(t)),
    ).slice(0, maxResults);
  }
}

let client: SimilarityClient | undefined;

export function getSimilarityClient(): SimilarityClient {
  if (client) return client;
  const key = getEnv().EXA_API_KEY;
  client = key ? new ExaClient(key) : new StubSimilarityClient();
  return client;
}
