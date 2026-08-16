import { z } from "zod/v4";

/**
 * Environment schema; single source of truth for configuration.
 *
 * API keys are optional by design: tool clients fall back to stubs when a key
 * is missing (see lib/tools). Only the database is required to boot.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z
    .string()
    .url()
    .describe("Postgres connection string, e.g. postgres://user:pass@host:5432/db"),

  // External service keys; all optional; missing key => stubbed client.
  // LLM provider: Anthropic is preferred when set; OpenAI is the fallback.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1"),
  TAVILY_API_KEY: z.string().min(1).optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  /** Firecrawl requests/minute budget (free tier is ~10/min). */
  FIRECRAWL_RPM: z.coerce.number().int().positive().default(10),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),

  // Per-run hard caps; every run finishes with whatever it has. Rounds are
  // meant to stop on their own (two dry rounds, or the planner returning no
  // leads); MAX_ROUNDS is only the runaway backstop, so it sits high.
  MAX_ROUNDS: z.coerce.number().int().positive().default(12),
  MAX_SEARCHES_PER_RUN: z.coerce.number().int().positive().default(100),
  MAX_FETCHES_PER_RUN: z.coerce.number().int().positive().default(60),

  // Global abuse guards (public demo endpoint).
  MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(3),
  DAILY_RUN_LIMIT: z.coerce.number().int().positive().default(25),
  RATE_LIMIT_RUNS_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;
