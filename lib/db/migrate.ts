import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "./client";

/**
 * Apply pending migrations from ./drizzle. Called once at server boot
 * (instrumentation.ts) so `docker compose up` and `next dev` both migrate
 * without a separate step.
 */
export async function runMigrations(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
}
