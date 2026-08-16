import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Drizzle has no built-in tsvector; minimal custom type (read-only column). */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const departments = pgTable("departments", {
  placeId: text("place_id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  county: text("county"),
  state: text("state"),
  phone: text("phone"),
  website: text("website"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  anchor: jsonb("anchor"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** status: queued | running | done | failed | interrupted (validated by Zod) */
export const researchRuns = pgTable(
  "research_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: text("place_id")
      .notNull()
      .references(() => departments.placeId),
    status: text("status").notNull().default("queued"),
    roundCount: smallint("round_count").notNull().default(0),
    capsHit: text("caps_hit").array().notNull().default([]),
    costCents: integer("cost_cents").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [index("research_runs_place_id_idx").on(t.placeId)],
);

/** Append-only SSE replay log: reconnects replay from Last-Event-ID. */
export const runEvents = pgTable(
  "run_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => researchRuns.id),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("run_events_run_id_seq_idx").on(t.runId, t.seq)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => researchRuns.id),
    url: text("url").notNull(),
    title: text("title"),
    tier: smallint("tier"),
    /** Markdown snapshot at research time; provenance for citation popovers. */
    contentMd: text("content_md"),
    contentHash: text("content_hash"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    publishedAt: date("published_at"),
  },
  (t) => [index("sources_run_id_idx").on(t.runId)],
);

/** No source, no fact: source_id is NOT NULL by design. */
export const facts = pgTable(
  "facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => researchRuns.id),
    placeId: text("place_id")
      .notNull()
      .references(() => departments.placeId),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id),
    /** leadership | fleet | procurement | funding | news | other */
    category: text("category").notNull(),
    tags: text("tags").array().notNull().default([]),
    claim: text("claim").notNull(),
    quote: text("quote").notNull(),
    asOfDate: date("as_of_date"),
    discoveredRound: smallint("discovered_round"),
    attributes: jsonb("attributes"),
    verification: text("verification"),
    confidence: text("confidence"),
    /** high | medium | low sales usefulness; orders facts within sections. */
    usefulness: text("usefulness"),
    stale: boolean("stale").notNull().default(false),
    searchVec: tsvector("search_vec").generatedAlwaysAs(
      // immutable_array_to_string is created in the initial migration ; 
      // array_to_string() is only STABLE, which generated columns reject.
      sql`to_tsvector('english', coalesce(claim, '') || ' ' || coalesce(quote, '') || ' ' || immutable_array_to_string(tags))`,
    ),
  },
  (t) => [
    index("facts_place_id_idx").on(t.placeId),
    index("facts_run_id_idx").on(t.runId),
    index("facts_search_vec_idx").using("gin", t.searchVec),
  ],
);

/** Entity graph nodes; relations live in attributes.relations. */
export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: text("place_id")
      .notNull()
      .references(() => departments.placeId),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    attributes: jsonb("attributes"),
  },
  (t) => [index("entities_place_id_idx").on(t.placeId)],
);

/** One current brief per department; history reachable via research_runs. */
export const briefs = pgTable("briefs", {
  placeId: text("place_id")
    .primaryKey()
    .references(() => departments.placeId),
  runId: uuid("run_id")
    .notNull()
    .references(() => researchRuns.id),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
