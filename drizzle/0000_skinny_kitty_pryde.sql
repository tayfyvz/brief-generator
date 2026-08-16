-- Generated columns require IMMUTABLE expressions; array_to_string() is only
-- STABLE, so facts.search_vec uses this immutable wrapper (safe for text[]).
CREATE FUNCTION immutable_array_to_string(text[]) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE
	RETURN array_to_string($1, ' ');
--> statement-breakpoint
CREATE TABLE "briefs" (
	"place_id" text PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"place_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"county" text,
	"state" text,
	"phone" text,
	"website" text,
	"lat" double precision,
	"lng" double precision,
	"anchor" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"attributes" jsonb
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"place_id" text NOT NULL,
	"source_id" uuid NOT NULL,
	"category" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"claim" text NOT NULL,
	"quote" text NOT NULL,
	"as_of_date" date,
	"discovered_round" smallint,
	"attributes" jsonb,
	"verification" text,
	"confidence" text,
	"stale" boolean DEFAULT false NOT NULL,
	"search_vec" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(claim, '') || ' ' || coalesce(quote, '') || ' ' || immutable_array_to_string(tags))) STORED
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"round_count" smallint DEFAULT 0 NOT NULL,
	"caps_hit" text[] DEFAULT '{}' NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"tier" smallint,
	"content_md" text,
	"content_hash" text,
	"fetched_at" timestamp with time zone,
	"published_at" date
);
--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_place_id_departments_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."departments"("place_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_place_id_departments_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."departments"("place_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_place_id_departments_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."departments"("place_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_place_id_departments_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."departments"("place_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_place_id_idx" ON "entities" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "facts_place_id_idx" ON "facts" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "facts_run_id_idx" ON "facts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "facts_search_vec_idx" ON "facts" USING gin ("search_vec");--> statement-breakpoint
CREATE INDEX "research_runs_place_id_idx" ON "research_runs" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_events_run_id_seq_idx" ON "run_events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "sources_run_id_idx" ON "sources" USING btree ("run_id");