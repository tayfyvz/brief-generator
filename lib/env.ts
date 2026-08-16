import { envSchema, type Env } from "@/lib/schemas/env";

let cached: Env | undefined;

/**
 * Parse and cache process.env. Fails fast at first access with a readable
 * list of what is missing/invalid rather than a Zod stack trace.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  cached = result.data;
  return cached;
}
