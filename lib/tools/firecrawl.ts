import { z } from "zod/v4";
import { getEnv } from "@/lib/env";
import { fetchedPageSchema, type FetchedPage } from "@/lib/schemas/tools";
import { FIXTURE_PAGES } from "./fixtures";

/**
 * Page/PDF → markdown extraction. Firecrawl when a key exists,
 * with a direct-fetch fallback (pdf-parse for PDFs, crude HTML strip)
 * because municipal sites are exactly where scrapers fail.
 * Returns null when the page can't be fetched at all.
 */
export interface FetchClient {
  fetchPage(url: string): Promise<FetchedPage | null>;
  readonly stubbed: boolean;
}

const firecrawlResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      markdown: z.string().optional(),
      metadata: z
        .object({
          title: z.string().optional(),
          publishedTime: z.string().optional(),
        })
        .passthrough()
        .optional(),
    })
    .optional(),
});

/** Shared fallback: plain fetch, PDFs via pdf-parse, HTML crudely stripped. */
async function directFetch(url: string): Promise<FetchedPage | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "brief-generator/0.1 (research bot)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
    // pdf-parse's package entry runs demo code when bundled; import the lib file.
    const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
    const buffer = Buffer.from(await res.arrayBuffer());
    const parsed = await pdfParse(buffer);
    return fetchedPageSchema.parse({
      url,
      title: parsed.info?.Title ?? undefined,
      markdown: parsed.text.trim(),
    });
  }

  const html = await res.text();
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return null;
  return fetchedPageSchema.parse({ url, title, markdown: text });
}

/**
 * Process-wide token bucket: six parallel tracks otherwise blow through
 * Firecrawl's per-minute quota instantly. Callers wait for a slot.
 */
const requestTimes: number[] = [];
async function waitForFirecrawlSlot(rpm: number): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (requestTimes.length > 0 && now - requestTimes[0] > 60_000) {
      requestTimes.shift();
    }
    if (requestTimes.length < rpm) {
      requestTimes.push(now);
      return;
    }
    const waitMs = 60_000 - (now - requestTimes[0]) + 250;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

class FirecrawlClient implements FetchClient {
  readonly stubbed = false;
  constructor(
    private readonly apiKey: string,
    private readonly rpm: number,
  ) {}

  async fetchPage(url: string): Promise<FetchedPage | null> {
    await waitForFirecrawlSlot(this.rpm);
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"], timeout: 30_000 }),
    });
    if (res.status === 429) {
      // Quota exhausted despite the bucket; degrade to the direct fetcher
      // rather than losing the page.
      return directFetch(url);
    }
    if (res.status === 402) {
      throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
    }
    if (!res.ok) {
      // Firecrawl can't handle every municipal site; try the direct fallback.
      return directFetch(url);
    }
    const parsed = firecrawlResponseSchema.parse(await res.json());
    const markdown = parsed.data?.markdown?.trim();
    if (!parsed.success || !markdown) return directFetch(url);
    return fetchedPageSchema.parse({
      url,
      title: parsed.data?.metadata?.title,
      markdown,
      publishedAt: parsed.data?.metadata?.publishedTime,
    });
  }
}

class StubFetchClient implements FetchClient {
  readonly stubbed = true;

  async fetchPage(url: string): Promise<FetchedPage | null> {
    return FIXTURE_PAGES[url] ?? null;
  }
}

let client: FetchClient | undefined;

export function getFetchClient(): FetchClient {
  if (client) return client;
  const env = getEnv();
  client = env.FIRECRAWL_API_KEY
    ? new FirecrawlClient(env.FIRECRAWL_API_KEY, env.FIRECRAWL_RPM)
    : new StubFetchClient();
  return client;
}
