# Fire Department Brief Generator

Paste a Google Place ID for a fire department and get a live-researched, fully cited one-page brief an account executive can read right before the call: who runs the department, what apparatus they operate, whether money is moving, and a "why call today" strip of dated signals on top.

Every fact links back to its source. A citation chip opens the source title, its trust tier, and the verbatim quote from our snapshot of the page.

## How it works

```
Place ID → anchor (Google Places) → entity resolution → six parallel tracks
           leadership · fleet · procurement · funding · news · discovery
         → expansion loop (leads from findings, runs until dry)
         → verify → synthesize → brief
```

- **Every fact is cited.** Facts carry a source and a verbatim quote validated against the page snapshot. No quote, no fact.
- **Verification.** A fresh-context verifier drops unsupported claims, surfaces conflicts side by side with a tier + recency note, and badges facts older than ~18 months as possibly stale.
- **Source tiers.** Official and government sources outrank news and directories. Community sources (wikis, social media) are citable only as clearly labeled, low-confidence data and are superseded by any higher-tier source.
- **Honest by default.** Sparse departments get short briefs that say so; empty sections are never padded.

**Stack:** Next.js + Postgres 16 (Drizzle), one Docker deployment. LangGraph orchestrates the pipeline with a Postgres checkpointer, so interrupted runs resume. Claude does extraction and judgment through Zod-validated structured outputs (Sonnet for high volume, Opus for entity resolution, verify, and synthesis). Tavily, Exa, and Firecrawl handle search and fetching. Runs execute in-process and stream progress over SSE with a persisted event log, so reconnects replay losslessly.

## Run it

```bash
cp .env.example .env   # API keys optional
docker compose up      # app on :3100, Postgres on :5433
```

Migrations run at boot. Open http://localhost:3100, paste a Place ID (or click a sample), and watch the run stream in.

**No API keys required to try it.** Every external service sits behind a thin typed client with a deterministic offline stub, so the full pipeline runs end to end without keys. Add keys to research real departments.

Local development:

```bash
docker compose up postgres   # just the DB
npm install
npm run dev                  # Next dev server
npm test                     # unit tests
```

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `ANTHROPIC_API_KEY` | no | LLM calls (offline stub without it; `OPENAI_API_KEY` works as fallback) |
| `TAVILY_API_KEY`, `EXA_API_KEY` | no | Keyword and semantic web search |
| `FIRECRAWL_API_KEY` | no | Page/PDF to markdown (falls back to direct fetch) |
| `GOOGLE_PLACES_API_KEY` | no | Place ID to department anchor |
| `MAX_SEARCHES_PER_RUN`, `MAX_FETCHES_PER_RUN` | no | Per-run budget caps (100 / 60) |
| `MAX_CONCURRENT_RUNS`, `DAILY_RUN_LIMIT`, `RATE_LIMIT_RUNS_PER_IP_PER_HOUR` | no | Public-endpoint guards (3 / 25 / 5) |

Env is validated with Zod at boot; invalid config fails fast with a readable message.

## Repo map

```
lib/schemas     Zod schemas, single source of truth (facts, brief, events, env)
lib/graph       LangGraph state, one module per node, runner
lib/llm         Anthropic/OpenAI clients, offline stub, all prompt text
lib/tools       Thin typed clients: Places, Tavily, Exa, Firecrawl
lib/research    Snapshots, tiering, fact storage, budgets, guards, run manager
lib/db          Drizzle schema, queries, migrations
app             Pages and API routes (research, SSE stream, search, chat)
components      Brief UI and live-run view
tests           Unit and integration tests
```

## Deploying

Deployed on [Railway](https://railway.com): single Docker image plus a managed Postgres service in the same project. `railway.json` holds the service config (Dockerfile build, `/api/health` healthcheck, restart policy). Any Dockerfile-based host works the same way.

1. Create a Railway project from this repo — it picks up `Dockerfile` and `railway.json` automatically.
2. Add a **Postgres** database service to the project.
3. On the app service, set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` (private-network reference), plus any API keys from the table above.
4. Deploy. Migrations run at boot, so a fresh database needs no manual setup.

Keep the app at **one replica**: research runs execute in-process and stream over SSE from the same instance, so state is not shared across replicas.

## Results and design notes

Live results on the three sample departments, what counts as signal vs noise, failure modes, and the scaling design are in [NOTES.md](NOTES.md).
