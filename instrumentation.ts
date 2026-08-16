/**
 * Next.js boot hook: validate env fail-fast, then run DB migrations.
 * Runs once per server start (dev and standalone prod alike).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv } = await import("@/lib/env");
  getEnv();
  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();
  console.log("[boot] env validated, migrations applied");
}
