import { z } from "zod";

/**
 * Environment schema — single source of truth for configuration.
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

  // External service keys — all optional; missing key => stubbed client.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  EXA_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),

  // Per-run hard caps (PLAN §2) — every run finishes with whatever it has.
  MAX_ROUNDS: z.coerce.number().int().positive().default(4),
  MAX_SEARCHES_PER_RUN: z.coerce.number().int().positive().default(60),
  MAX_FETCHES_PER_RUN: z.coerce.number().int().positive().default(40),

  // Global abuse guards (public demo endpoint).
  MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(3),
  DAILY_RUN_LIMIT: z.coerce.number().int().positive().default(25),
  RATE_LIMIT_RUNS_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;
