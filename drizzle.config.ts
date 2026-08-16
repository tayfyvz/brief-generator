import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit runs outside the app; read env directly (validated app-side).
    url: process.env.DATABASE_URL ?? "postgres://brief:brief@localhost:5433/brief",
  },
});
