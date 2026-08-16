import { getEnv } from "@/lib/env";
import type { SearchResult } from "@/lib/schemas/tools";

/**
 * Exa semantic search / find-similar — expansion phase only (PLAN §1).
 * Stub-only for now (build step 3); the real client lands with the
 * expansion loop in step 6.
 */
export interface SimilarityClient {
  findSimilar(url: string, maxResults?: number): Promise<SearchResult[]>;
  searchSemantic(query: string, maxResults?: number): Promise<SearchResult[]>;
  readonly stubbed: boolean;
}

class StubSimilarityClient implements SimilarityClient {
  readonly stubbed = true;

  async findSimilar(): Promise<SearchResult[]> {
    return [];
  }

  async searchSemantic(): Promise<SearchResult[]> {
    return [];
  }
}

let client: SimilarityClient | undefined;

export function getSimilarityClient(): SimilarityClient {
  if (client) return client;
  // EXA_API_KEY is read so the env contract is stable; real client in step 6.
  void getEnv().EXA_API_KEY;
  client = new StubSimilarityClient();
  return client;
}
