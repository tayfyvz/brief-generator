import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/** Survive Next.js dev-server hot reloads without leaking pools. */
const globalForDb = globalThis as unknown as { __briefDbPool?: Pool };

let db: Db | undefined;

export function getDb(): Db {
  if (db) return db;
  const pool =
    globalForDb.__briefDbPool ??
    new Pool({ connectionString: getEnv().DATABASE_URL, max: 10 });
  globalForDb.__briefDbPool = pool;
  db = drizzle(pool, { schema });
  return db;
}
