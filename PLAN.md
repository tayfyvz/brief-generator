# Fire Department Brief Generator — Implementation Plan (v2, final)

Paste a Google Place ID → get a live-researched, fully-cited one-page brief an AE can
use right before a call. Priorities: **reliability & completeness of data**, then
**AE-facing clarity/speed**, then engineering simplicity (no over-engineering).

---

## 0. Engineering principles (apply to every decision below)

1. **Simple over clever.** One process, one database, no queues/Redis/microservices.
   Scale paths are *documented*, not pre-built.
2. **Modular via thin boundaries.** External services sit behind small typed clients
   (`lib/tools/*`). One interface per concern — no abstraction towers.
3. **Zod schemas are the single source of truth** for every data shape (facts, brief,
   SSE events, env config) — shared by pipeline, DB layer, and frontend.
4. **Fail soft, never silently.** A failed search/track/lead degrades to fewer facts and
   a visible warning — never a crashed run, never an invisible gap.
5. **Everything reviewable.** Typed end-to-end, linted, small focused modules, README
   that explains the why. The codebase is part of the submission.

---

## 1. Technology stack & why

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 15 (App Router, TS)** — single dockerized Node server (`output: "standalone"`) | Required by assignment. One long-running process serves UI + API + SSE + background research runs. Docker (see §7) removes serverless limits, so no separate worker infra is needed. |
| Orchestration | **LangGraph.js** | Pipeline is a graph with fan-out, a cycle (expansion), shared typed state. Gives conditional edges, **Postgres checkpointing** (interrupted runs resume mid-phase), per-node event streaming → SSE. Boundary rule: LangGraph orchestrates; nodes call SDKs directly (no LangChain model/prompt wrappers). |
| LLM | **`@anthropic-ai/sdk` — `claude-opus-5`** (planner/verify/synthesize) | Strongest reasoning for disambiguation + verification; structured outputs (`output_config.format`) guarantee schema-valid facts. Cost lever: `claude-sonnet-5` for bulk extraction if needed. |
| Search | **Tavily** (keyword, primary) + **Exa** (semantic/"find similar", expansion phase only) | Tavily: best all-round agent search with domain filtering. Exa: discovery of dealer delivery pages / obscure gov PDFs that keyword search misses. Exa is scoped to expansion to keep the core path simple. |
| Extraction | **Firecrawl** (page/PDF → markdown) + `pdf-parse` fallback | Budgets, minutes, bid tabs are PDFs on ancient municipal sites. |
| Anchor | **Google Places Details API** | Place ID → name/address/phone/website: the disambiguation anchor. |
| DB | **Postgres 16 + Drizzle ORM** (JSONB + FTS) | §5. Relational citations + flexible JSONB payloads + full-text search, one database. Runs in docker-compose locally; managed PG in prod. |
| Frontend state | **Zustand (one small store) + React Server Components** | §6. Zustand holds only live-run state (SSE stream: phases, facts, warnings). Cached briefs are fetched server-side — no client store needed for them. No Redux, no react-query: two data paths don't justify more machinery. |
| UI | **Tailwind CSS + shadcn/ui + lucide icons** | Fast path to a polished, consistent, eye-catching UI without a design system project. |
| Deploy | **Docker → Railway or Fly.io** + managed Postgres; repo on GitHub | Assignment needs a public link + shared codebase. Single `Dockerfile` + `docker-compose.yml` gives identical local/prod behavior. |

---

## 2. Runtime model (the gap v1 didn't cover)

A research run takes minutes; an HTTP request must not. The dockerized long-running
server makes this simple — **no job queue needed at this scale**:

- `POST /api/research` → validates Place ID, creates a `research_runs` row, starts the
  LangGraph run **in-process** via a `RunManager` singleton (map of active runs +
  event emitter), returns `{runId}` immediately.
- **Single-flight per department:** a second request for a Place ID with an active run
  joins that run instead of starting a duplicate (in-memory lock keyed by place_id).
- `GET /api/research/[runId]/stream` (SSE) → replays the run's **persisted event log**
  from Postgres first, then tails live events. Client reconnects are therefore lossless
  (`Last-Event-ID` → replay from that point).
- **Crash safety:** LangGraph's Postgres checkpointer persists graph state per node; on
  boot, the server marks orphaned `running` rows as `interrupted` (resumable via the
  Refresh button).
- **Scale note (for the write-up, not built):** at 100 AEs / 1M departments, `RunManager`
  is replaced by a queue + worker pool and weekly Batch-API refreshes; the DB schema and
  graph code are unchanged.

### Cost & abuse guards (required — this is a public demo endpoint)
- Per-run hard caps: `MAX_ROUNDS=4`, `MAX_SEARCHES_PER_RUN`, `MAX_FETCHES_PER_RUN`,
  token budget; the run finishes with whatever it has when a cap hits (visible as a
  "budget reached" note).
- Global caps: per-IP rate limit (in-memory) + max concurrent runs + daily run limit —
  a stranger who finds the URL can't burn the API budget.
- Cached-brief reads are uncapped (cheap).

---

## 3. Pipeline (unchanged from v1 in substance — restated with fixes)

LangGraph `StateGraph`; shared state: anchor, entityGraph, facts, sources, leads,
round, searchedQueries/visitedUrls (dedupe sets), warnings, phase events.

- **N0 `resolveAnchor`** — Places Details, deterministic. Anchor packet is injected into
  every prompt with the standing rule: *discard sources about similarly-named
  departments elsewhere* (failure mode #1: wrong-department contamination).
- **N1 `resolveEntity`** — agentic loop answering "who operates this station and who
  buys the trucks?" → entity graph (parent org, member municipalities, county, board,
  official site). The keystone: without it, later searches target the wrong entity.
- **N2 fan-out — 6 parallel tracks**, each an agentic sub-loop (tools: `search_tavily`,
  `fetch_page`) seeded with anchor + entity graph + the **source playbook** (§4):
  leadership/contacts · fleet/apparatus (incl. fleet-age analysis) · procurement/bids ·
  budgets/grants/capital · news/signals · **open discovery (catch-all)** — anything
  sales-relevant the named tracks miss; lands in `category:"other"` + tags, never dropped.
- **N3 `planExpansion` ⟲** — planner turns discovered entities into new leads (dealer →
  delivery pages via Exa "similar"; legislators → appropriations; member towns → budget
  PDFs & council minutes; fleet years → replacement-cycle queries; Tier-4 claims →
  verification queries) + a completeness-critic question ("what would an AE ask that we
  still can't answer?"). Loop until **two consecutive dry rounds** or round cap; dedupe
  against searched/visited sets.
- **N4 `verify`** — fresh-context verifier judges each `(claim, quote, snapshot)`:
  quote present? claim supported? Conflicts resolved by tier + recency and **surfaced**
  in the brief, never silently picked. Unsupported/uncited facts dropped. Staleness
  flagged (>~18 months).
- **N5 `synthesize`** — verified facts only → brief JSON (why-call-today ranked signals,
  contacts, fleet, money-moving, conflicts/caveats) → persisted.

Failure handling: every external call retried w/ backoff, then degrades to zero results
+ a `warnings[]` entry rendered in the UI ("News track partially failed").

---

## 4. Source playbook (prompt asset, `lib/llm/prompts/playbook.ts`)

Trust tiers (conflicts resolve upward; Tier 4 generates leads, never sole citations):
- **T1 authoritative:** official dept/municipal/county sites; state procurement portals;
  budgets/audits/CAFRs/bond ordinances; council agendas & minutes (ecode360, Granicus,
  CivicClerk); federal appropriations tables; FEMA AFG/SAFER awards; USFA registry.
- **T2 industry:** manufacturer new-delivery pages (Pierce, Ferrara, E-ONE, Sutphen,
  Seagrave…); dealer delivery pages; Fire Apparatus Magazine; Firehouse.com.
- **T3 local press.** **T4 leads-only:** fire.fandom, stationboss, YouTube, Facebook, forums.

Guidance, not a fence: tracks prefer these source *types* but pursue anything relevant.

---

## 5. Storage (Postgres — simplified from v1)

Fixed columns for what every fact must have; **JSONB for the unpredictable payload**;
snapshots for provenance; FTS for AE search.

```sql
departments   (place_id PK, name, address, city, county, state, phone, website,
               lat, lng, anchor JSONB, created_at)
research_runs (id PK, place_id FK, status,            -- queued|running|done|failed|interrupted
               round_count, caps_hit TEXT[], cost_cents, started_at, finished_at, error)
run_events    (id PK, run_id FK, seq, type, payload JSONB, created_at)   -- SSE replay log
sources       (id PK, run_id FK, url, title, tier SMALLINT,
               content_md TEXT,                        -- snapshot at research time
               content_hash, fetched_at, published_at)
facts         (id PK, run_id FK, place_id FK, source_id FK NOT NULL,     -- no source, no fact
               category TEXT, tags TEXT[],             -- leadership|fleet|procurement|funding|news|other
               claim TEXT, quote TEXT, as_of_date DATE, discovered_round SMALLINT,
               attributes JSONB,                       -- open-ended structured payload
               verification TEXT, confidence TEXT, stale BOOLEAN,
               search_vec tsvector GENERATED)          -- claim+quote+tags → AE quick-find
entities      (id PK, place_id FK, kind TEXT, name TEXT,
               attributes JSONB)                       -- incl. "relations":[...] — no edges table (v1 trim)
briefs        (place_id PK, run_id FK, content JSONB, created_at)  -- latest brief per dept
```

v1 → v2 changes: dropped `entity_edges` (relations live in `entities.attributes` —
one less table, same information); added `run_events` (SSE replay); `briefs` keyed by
`place_id` (one current brief; history reachable via runs). pgvector remains a
documented later upgrade — FTS is enough now.

---

## 6. Frontend — structure, state, UX

### State model (keep it boring)
- **Cached brief path:** server component fetches brief + facts from DB, renders HTML.
  No client store involved. Fast (<200ms), SEO-irrelevant but SSR-fast.
- **Live run path:** one **Zustand store** (`useRunStore`): `{status, phases, facts[],
  warnings[], capsHit}` fed by a single SSE subscriber hook. Components select slices.
  That's the entire client state. No Redux, no react-query, no context pyramid.
- Shared Zod types (`lib/schemas`) type both paths and the SSE payloads.

### Screens & UX (eye-catching, scannable, honest)
1. **Home:** centered Place ID input + the 3 assignment IDs as one-click sample chips +
   recent briefs list. Zero learning curve.
2. **Brief page** (`/brief/[placeId]`):
   - **Header (instant):** department name, address, click-to-call phone, website,
     freshness banner ("Researched 6 days ago · Refresh").
   - **"Why call today" strip:** top 3 ranked, dated signals — the 10-second read.
   - **Four sections** (sticky in-page nav): Who to call (contact cards) · What they
     drive (fleet table, age-flagged rows) · Money moving (amount/date/status) ·
     Recent signals. Curated top facts by default; "Show all N findings" expander per
     section; "Also found" section for `other`.
   - **Citation chip on every fact** → popover: source title, tier badge, verbatim
     quote highlighted from our snapshot, "open source ↗". The "where'd you hear that"
     answer in one click.
   - **Fact search box** (`/` to focus): Postgres FTS over claim/quote/tags with match
     highlighting — find "tiller" or "Sourcewell" in seconds.
   - **Honesty markers:** staleness badges, confidence dots, explicit conflict callouts,
     visible track warnings ("news research partial").
3. **Live run view** (same page, run in progress): phase timeline (Entity → 6 track
   cards with live search/fact counters → Expansion round n/4 → Verify → Done),
   skeletons per section, verified facts slotting into sections as they land. Depth is
   visible — that's the demo moment.

Visual: shadcn/ui components, one accent color, generous whitespace, tabular numerals
for specs/amounts, subtle motion on fact arrival. Simple > flashy.

---

## 7. Docker & deployment

- **`Dockerfile`:** multi-stage — deps → build (`next build`, standalone output) →
  slim `node:22-alpine` runtime, non-root user, `HEALTHCHECK` on `/api/health`.
- **`docker-compose.yml`:** `app` + `postgres:16` (+ volume). `docker compose up` =
  full local stack; Drizzle migrations run on container start.
- **`.env.example`** documents every variable; env validated with Zod at boot (fail
  fast with a readable message listing what's missing).
- **Prod:** same image on Railway or Fly.io + managed Postgres. Public URL for the
  reviewer; secrets only in the host's env store — never in the repo.

## 8. Repo quality (codebase is reviewed)

- Structure as v1 §6 (`lib/graph`, `lib/tools`, `lib/llm`, `lib/db`, `components/`).
- ESLint + Prettier + strict TS; GitHub Actions: lint + typecheck + tests on push.
- **Tests — proportionate, not perfoming:** unit tests for pure logic (dedupe, tier
  resolution, schema parsing, ranking); one graph integration test with mocked tool
  clients; no E2E theater.
- README: what/why/how-to-run (`docker compose up`), architecture diagram, env table,
  and the assignment write-up content.

## 9. Build order

1. Scaffold: Next.js + Tailwind/shadcn + Drizzle schema + compose file + env validation + health route.
2. Places anchor lookup + home/brief page shells (cached-path rendering with seed data).
3. Tool clients (Tavily/Firecrawl; Exa stub) + snapshot storage + retry/degrade wrapper.
4. LangGraph skeleton: anchor → entity → one track → synthesize, end-to-end on one test Place ID.
5. All six tracks + strict fact extraction + RunManager + SSE with `run_events` replay.
6. Expansion loop (add Exa) + dedupe + caps.  7. Verification node.
8. Full brief UI: citation popovers, FTS search, phase timeline, warnings, freshness/Refresh.
9. Guards (rate limits, caps) + Dockerfile polish + deploy to Railway/Fly.
10. Run the 3 assignment Place IDs, tune prompts/playbook, write README + notes.
