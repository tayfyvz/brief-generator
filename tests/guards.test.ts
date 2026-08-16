import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.RATE_LIMIT_RUNS_PER_IP_PER_HOUR = "2";

const { checkIpRateLimit, resetIpRateLimit } = await import(
  "@/lib/research/guards"
);

describe("per-IP rate limit", () => {
  beforeEach(() => resetIpRateLimit());

  it("allows up to the hourly limit, then rejects with 429", () => {
    const now = Date.now();
    expect(checkIpRateLimit("1.2.3.4", now).ok).toBe(true);
    expect(checkIpRateLimit("1.2.3.4", now).ok).toBe(true);
    const third = checkIpRateLimit("1.2.3.4", now);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.status).toBe(429);
  });

  it("tracks IPs independently", () => {
    const now = Date.now();
    checkIpRateLimit("1.1.1.1", now);
    checkIpRateLimit("1.1.1.1", now);
    expect(checkIpRateLimit("2.2.2.2", now).ok).toBe(true);
  });

  it("frees budget as old hits age out of the window", () => {
    const start = Date.now();
    checkIpRateLimit("3.3.3.3", start);
    checkIpRateLimit("3.3.3.3", start);
    expect(checkIpRateLimit("3.3.3.3", start + 3_600_001).ok).toBe(true);
  });
});
