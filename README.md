# Fire Department Brief Generator

Paste a Google Place ID for a fire department → get a **live-researched, fully-cited one-page brief** an account executive can read right before the call: who runs the department, what they're driving, whether there's money moving — and a "why call today" strip on top.

Every fact links back to its source: a citation chip opens the source title, trust tier, and the **verbatim quote** from our snapshot of the page.

## How it works

```
Place ID
   │
   ▼
┌───────────────┐   ┌───────────────┐   ┌──────────────────────────────┐
│ N0 anchor     │──▶│ N1 entity     │──▶│ N2  six parallel tracks      │
│ Google Places │   │ who operates? │   │ leadership · fleet · procure │
│ (ground truth)│   │ who buys?     │   │ funding · news · discovery   │
└───────────────┘   └───────────────┘   └──────────────┬───────────────┘
                                                       ▼
                    ┌───────────────┐   ┌──────────────────────────────┐
                    │ N4 verify     │◀──│ N3 expansion loop ⟲          │
                    │ fresh-context │   │ leads from entities/facts    │
                    │ + conflicts   │   │ (Tavily + Exa find-similar)  │
                    └──────┬────────┘   └──────────────────────────────┘
                           ▼
                    ┌───────────────┐
                    │ N5 synthesize │──▶ brief JSON → UI
                    └───────────────┘
```

- **Orchestration:** LangGraph.js `StateGraph` with typed shared state and a Postgres checkpointer (interrupted runs resume mid-phase). Inside nodes we call the Anthropic SDK, Tavily, Exa, and Firecrawl clients directly — no LangChain model wrappers.
- **LLM:** `claude-opus-5` with structured outputs (`messages.parse` + Zod schemas) for entity resolution, query planning, fact extraction, verification, and synthesis.
- **Hard rules:** every fact carries a `source_id` + verbatim quote (validated against the page snapshot — no quote, no fact); tier-4 sources (fan wikis, YouTube, forums) generate leads but are never citations; unsupported facts are dropped by a fresh-context verifier; conflicts are surfaced with a tier+recency resolution note, never silently picked; facts older than ~18 months get a staleness badge.
- **Runtime:** one long-running dockerized Next.js server. `POST /api/research` returns `{runId}` immediately; the run executes in-process (`RunManager`, single-flight per Place ID) and streams progress over SSE with a persisted `run_events` log, so reconnects replay losslessly from `Last-Event-ID`.
- **Storage:** Postgres 16 + Drizzle. Fixed columns for what every fact must have, JSONB for the open-ended payload, page snapshots for citation provenance, and a generated `tsvector` powering the fact quick-find (press `/` on a brief).

## Run it

```bash
cp .env.example .env       # add API keys if you have them (optional — see below)
docker compose up          # app on :3100, Postgres on :5433
```

Migrations run automatically at boot. Open http://localhost:3100, paste a Place ID (or click a sample chip), and watch the run: phase timeline → six track cards with live counters → expansion rounds → verify → brief.

**No API keys? Everything still works.** Every external service sits behind a thin typed client with a deterministic offline stub (fixture-backed search/fetch/LLM), so the full pipeline — including the live-run UI — is exercisable end-to-end without spending a cent. Add keys to go live.

Local development outside Docker:

```bash
docker compose up postgres   # just the DB
npm install
npm run dev                  # Next dev server
npm run graph:dev            # run the research graph from the CLI
npm test                     # unit tests
```

> npm on macOS sometimes writes a lockfile missing Linux-only optional deps, which breaks `npm ci` in Docker. `npm run lock:fix` regenerates it inside a Linux container.

## Environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | Postgres connection string |
| `ANTHROPIC_API_KEY` | – | stub | Claude (planning, extraction, verify, synthesis) |
| `TAVILY_API_KEY` | – | stub | Keyword web search (primary) |
| `EXA_API_KEY` | – | stub | Semantic search / find-similar (expansion only) |
| `FIRECRAWL_API_KEY` | – | stub | Page/PDF → markdown (falls back to direct fetch + pdf-parse) |
| `GOOGLE_PLACES_API_KEY` | – | stub | Place ID → anchor (name/address/phone/website) |
| `MAX_ROUNDS` | – | 4 | Expansion round cap |
| `MAX_SEARCHES_PER_RUN` / `MAX_FETCHES_PER_RUN` | – | 60 / 40 | Per-run budget; runs finish with what they have |
| `MAX_CONCURRENT_RUNS` / `DAILY_RUN_LIMIT` / `RATE_LIMIT_RUNS_PER_IP_PER_HOUR` | – | 3 / 25 / 5 | Public-endpoint abuse guards (cached reads uncapped) |

Env is validated with Zod at boot — missing/invalid config fails fast with a readable message.

## Repo map

```
lib/schemas     Zod schemas — single source of truth (facts, brief, SSE events, env)
lib/graph       LangGraph state, nodes (N0–N5), build, runner, checkpointer
lib/llm         Anthropic client + offline stub + prompt assets (source playbook)
lib/tools       Thin typed clients: Places, Tavily, Exa, Firecrawl (+ fixtures)
lib/research    Snapshots, tiering, fact storage/dedupe, budget, guards, RunManager
lib/db          Drizzle schema, client, queries, seed
app             Home, brief page, /api/research (+SSE), /api/brief search, health
components      Brief UI (citations, sections, search) + live-run view
tests           Unit tests: retry/degrade, tiering, budget, staleness, guards
```

## Deploying

Single Docker image + managed Postgres. A `fly.toml` is included (`fly launch` → `fly secrets set …` → `fly deploy`); Railway works the same way (deploy the Dockerfile, provision Postgres, set env vars).

## Design notes & write-up

See `PLAN.md` for the full architecture rationale. The assignment write-up (what's useful vs noise, where this is confidently wrong, the 1M-departments design, cold-start in 30 seconds) ships with the submission notes.
