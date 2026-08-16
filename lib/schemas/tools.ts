import { z } from "zod";

/** One web-search hit, normalized across Tavily/Exa. */
export const searchResultSchema = z.object({
  url: z.string().url(),
  title: z.string().default(""),
  /** Snippet or extracted content from the search API. */
  snippet: z.string().default(""),
  publishedAt: z.string().optional(), // ISO date if the API supplies one
  score: z.number().optional(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

/** A fetched page snapshot, normalized across Firecrawl/fallback fetcher. */
export const fetchedPageSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  markdown: z.string(),
  publishedAt: z.string().optional(),
});
export type FetchedPage = z.infer<typeof fetchedPageSchema>;

/** A visible degradation notice (PLAN: fail soft, never silently). */
export const warningSchema = z.object({
  scope: z.string(), // e.g. "search", "fetch", "track:news"
  message: z.string(),
});
export type Warning = z.infer<typeof warningSchema>;
