import type { Warning } from "@/lib/schemas/tools";

export interface RetryOptions {
  /** Total attempts = retries + 1. */
  retries?: number;
  baseDelayMs?: number;
  label?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Exponential backoff with jitter. Throws the last error when exhausted. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 500, label = "call" }: RetryOptions = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delay = baseDelayMs * 2 ** attempt * (0.5 + Math.random());
        await sleep(delay);
      }
    }
  }
  throw new Error(`${label} failed after ${retries + 1} attempts: ${lastErr}`);
}

/**
 * Fail-soft boundary: run with retries; on final failure return
 * `fallback` and emit a visible warning instead of crashing the run.
 */
export async function withDegrade<T>(
  fn: () => Promise<T>,
  fallback: T,
  scope: string,
  onWarning: (w: Warning) => void,
  opts: RetryOptions = {},
): Promise<T> {
  try {
    return await withRetry(fn, { label: scope, ...opts });
  } catch (err) {
    onWarning({
      scope,
      message: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}
