# Agent Moneyball

Agent Moneyball is an evidence-gated baseball scouting assistant. It turns plain-English questions into executed Pandas analyses over a bundled TrackMan-style demo dataset, checks the computed evidence, and only then returns numerical claims.

The public deployment is intentionally demo-only: private uploads are disabled, the prepared dataset is stored in Supabase, and the website and API are password/secret protected.

- Web app: [pitchquery-tau.vercel.app](https://pitchquery-tau.vercel.app)
- Interactive API docs when running locally: [localhost:8000/docs](http://localhost:8000/docs)
- Data license and provenance: [data/ATTRIBUTION.md](data/ATTRIBUTION.md)

## What it can do

- Analyze pitch usage, velocity, spin, movement, outcomes, count splits, handedness, locations, and sequences.
- Render strike-zone plots from numeric plate coordinates.
- Stream the analysis process while it runs.
- Attach reproducible evidence, including the executed method and result rows.
- Refuse unsupported questions instead of inventing an answer.
- Build a multi-page scouting report from saved analysis artifacts.
- Load the same 21-game demo dataset locally or from Supabase in production.

## How it works

```text
Browser
  │  password-protected Next.js app
  ▼
Same-origin API relay
  │  server-only API secret
  ▼
FastAPI + LangGraph analyst
  │  execute → validate evidence → revise or answer
  ├──────────────► OpenAI Code Interpreter
  └──────────────► Supabase demo dataset + usage ledger
```

Numerical answers are based on executed data analysis, not model memory. The backend checks that the response is supported by the generated evidence before returning it.

## Launch locally

### Prerequisites

- [Pixi](https://pixi.sh) for the Python and Node toolchain
- An OpenAI API key for live analysis

### 1. Clone and install

~~~bash
git clone https://github.com/cmuchancel/agentmoneyball.git
cd agentmoneyball
pixi install
pixi run frontend-install
~~~

### 2. Configure the local API

Create the local environment file:

~~~bash
cp .env.example .env
~~~

Open `.env` and set your OpenAI key:

~~~dotenv
OPENAI_API_KEY=your-real-openai-api-key
OPENAI_MODEL=gpt-5.4-mini
~~~

Leave `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PITCHQUERY_API_SECRET` blank for localhost. Local development reads the bundled CSV dataset directly and does not require Supabase, Vercel, or the production password.

### 3. Start the backend

In terminal 1, from the repository root:

~~~bash
pixi run backend
~~~

Wait for Uvicorn to report that it is running on `http://127.0.0.1:8000`. Verify it with:

~~~bash
curl http://localhost:8000/api/health
~~~

### 4. Start the frontend

In terminal 2, from the same repository root:

~~~bash
pixi run frontend
~~~

Open [http://localhost:3000](http://localhost:3000). The app loads the bundled demo dataset automatically. Local development bypasses the password screen when production password/session variables are absent.

To stop either server, press `Ctrl+C` in its terminal.

The bundled dataset in `data/trackman_v3_games/` contains 3,344 anonymized pitches across 21 TrackMan V3 college scrimmage files. Stable fictional names are applied at runtime while source IDs remain attached.

## Common commands

Run these from the repository root unless noted otherwise.

| Command | Purpose |
| --- | --- |
| `pixi install` | Create the reproducible project environment. |
| `pixi run frontend-install` | Install pinned frontend dependencies. |
| `pixi run backend` | Start FastAPI with reload on port 8000. |
| `pixi run frontend` | Start Next.js on port 3000. |
| `pixi run test` | Run the backend test suite. |
| `pixi run typecheck` | Check all frontend TypeScript without emitting files. |
| `pixi run build` | Create the production frontend build. |
| `pixi run check` | Run backend tests, frontend type checking, and the production build. |
| `pixi run seed-demo` | Prepare and upload the bundled demo dataset to Supabase. |
| `pixi run pytest backend/tests/test_chart_tool.py -q` | Run one focused backend test module. |
| `cd frontend && npm run dev` | Start only the frontend using the local Node install. |
| `cd frontend && npm run lint` | Run the frontend static check; on Next.js 16 this aliases TypeScript checking. |
| `cd frontend && npm run check` | Type-check and production-build the frontend. |

Useful API smoke checks:

```bash
curl http://localhost:8000/api/health
curl -X POST http://localhost:8000/api/datasets
```

To run one test by name:

```bash
pixi run pytest backend/tests/test_chart_tool.py -q -k whiff
```

Before submitting or grading the project, run:

```bash
pixi run check
```

## Copy/paste AI prompt library

These prompts are scoped to fields that exist in the bundled demo dataset. Start with the named pitcher Caleb Archer so results are easy to reproduce. Names in the demo are stable fictional aliases attached to the original source IDs.

| Scope | What the prompt exercises |
| --- | --- |
| Location | Numeric plate coordinates and interactive strike-zone rendering. |
| Arsenal | Pitch type, usage, velocity, spin, and movement. |
| Situational | Count and batter-handedness splits. |
| Sequence | Pitch order within a plate appearance. |
| Comparison | Grouped metrics with sample-size controls. |
| Evidence boundary | A deliberate request for fields the demo does not contain. |

### Location and whiffs

```text
Where does Caleb Archer get swings and misses? Render the strike zone and color by pitch type.
```

Expected sanity check: 25 whiffs — 20 changeups, 3 fastballs, and 2 sliders.

```text
Show every Caleb Archer pitch location, color by pitch type, and summarize the concentration inside and outside the strike zone.
```

```text
Where does Caleb Archer throw on 0-2 counts? Plot the locations and break the results down by pitch type.
```

### Arsenal and movement

```text
Summarize Caleb Archer's arsenal by pitch type, including usage, velocity, spin rate, horizontal movement, and induced vertical movement.
```

```text
Compare Caleb Archer's fastball and changeup velocity, movement, and results. Explain which differences are most meaningful.
```

```text
Rank pitchers with at least 25 fastballs by average fastball velocity. Show pitch count and velocity.
```

### Counts, matchups, and sequencing

```text
Show Caleb Archer's pitch mix by count and identify his largest two-strike tendency.
```

```text
Split Caleb Archer's results by batter handedness. Include pitch count, strike rate, whiff rate, and pitch mix.
```

```text
What does Caleb Archer throw immediately after a called-strike fastball? Group the next pitch by pitch type and result.
```

```text
Find plate appearances where Caleb Archer threw two consecutive fastballs. What did he throw next, and what happened?
```

### Report building

```text
Build a scouting summary for Caleb Archer with arsenal, count tendencies, whiff locations, and a concise game-plan recommendation.
```

Add useful results to the report as you go, then switch to the report view to review the assembled pages.

### Evidence-gate test

```text
How does Caleb Archer perform with runners in scoring position by inning and score differential?
```

The demo schema does not contain the required baserunner and score state. A correct response explains that the question cannot be answered from the available evidence.

## API overview

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Confirm API availability. |
| `POST` | `/api/datasets` | Load the prepared demo dataset. |
| `POST` | `/api/chat` | Stream analysis progress and the final answer as NDJSON. |

Production API routes require `X-PitchQuery-Secret`. The browser never receives that secret; the Next.js server relay adds it. See [docs/API.md](docs/API.md) for request and response examples.

## Project map

```text
.
├── backend/
│   ├── main.py                    FastAPI routes and application metadata
│   ├── scouting/
│   │   ├── chart_tool.py          Deterministic chart/filter execution
│   │   ├── data.py                CSV validation and dataset profiling
│   │   ├── graph.py               Analyst, evidence gate, and revision graph
│   │   ├── prompts.py             Model contracts and domain guidance
│   │   ├── schemas.py             Pydantic contracts and deterministic checks
│   │   ├── supabase_store.py      Production dataset and ledger persistence
│   │   └── usage.py               Bounded usage accounting
│   └── tests/                     Backend regression tests
├── data/
│   └── trackman_v3_games/         Bundled demo CSVs
├── docs/                          Architecture, API, and deployment guides
├── frontend/
│   ├── app/                       Next.js routes, API relay, login, and shell
│   ├── components/ui/             Reusable presentation primitives
│   ├── features/scouting/         Scouting domain, prompts, plots, and results
│   ├── lib/api.ts                 Typed streaming API client
│   ├── lib/auth.ts                Server-side session helpers
│   └── proxy.ts                   Whole-site password boundary
├── scripts/                       Dataset preparation and Supabase seeding
├── supabase/migrations/           Reproducible database schema
├── pixi.toml                      Environment and canonical commands
└── vercel.json                    API deployment configuration
```

The frontend feature split keeps business types and formatting in `domain.ts`, proven examples in `prompts.ts`, strike-zone rendering in `strike-zone.tsx`, and result presentation in `analysis-results.tsx`. The main page coordinates state and user interactions without owning those implementations.

## Configuration

### Backend

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | For live chat | OpenAI project key used by the analyst. |
| `OPENAI_MODEL` | No | Defaults to `gpt-5.4-mini`. |
| `PITCHQUERY_DAILY_TOKEN_LIMIT` | No | Daily application token ceiling. |
| `PITCHQUERY_TOKEN_RESERVE` | No | Headroom reserved for an in-flight analysis. |
| `FRONTEND_ORIGIN` | Production | Allowed web origin for CORS. |
| `SUPABASE_URL` | Production | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Server-only database credential. |
| `PITCHQUERY_API_SECRET` | Production | Shared secret accepted by protected API routes. |

### Frontend

| Variable | Required | Description |
| --- | --- | --- |
| `PITCHQUERY_API_URL` | Production | Server-side URL of the deployed API. |
| `PITCHQUERY_API_SECRET` | Production | Same API secret as the backend; never public. |
| `PITCHQUERY_PASSWORD` | Production | Password checked by the login route. |
| `PITCHQUERY_SESSION_TOKEN` | Production | Long random value used to sign the session cookie. |
| `NEXT_PUBLIC_API_URL` | Local only | Optional direct local API override. Do not use for the protected production path. |

Never commit real credentials. `.env.example` files document names only, and `.gitignore` excludes local secrets.

## Correctness and security boundaries

- The public product uses only the bundled demo dataset; upload controls are visibly disabled.
- Production authentication is enforced at the Next.js boundary, not only hidden in the UI.
- The browser calls a same-origin relay, so the API secret remains server-side.
- The API separately rejects requests with a missing or invalid secret.
- Supabase's service-role key is used only by the backend.
- Dataset IDs are derived from content, making repeated demo loads stable.
- Pitcher/batter aliases remain tied to structural source IDs.
- Location plots require finite numeric plate coordinates.
- Whiffs include the normalized outcome aliases covered by regression tests.
- Rates must include explicit numerators and denominators in evidence.
- Unsupported analyses return `cannot_answer` rather than fabricated values.
- Usage is bounded by tool-call, output, and daily ledger limits.

## Grading checklist

- [ ] `pixi install` succeeds from a clean clone.
- [ ] `.env` is created from `.env.example`; no secret is committed.
- [ ] `pixi run check` passes.
- [ ] `/api/health` returns `{"status":"ok"}`.
- [ ] `/api/datasets` reports 21 games and 3,344 pitches.
- [ ] The verified whiff prompt returns 25 total whiffs with the expected pitch-type split.
- [ ] The unsupported-schema prompt returns a clear evidence limitation.
- [ ] Upload buttons remain disabled in demo mode.
- [ ] Production `/api/*` requests fail without the shared API secret.
- [ ] Production pages redirect unauthenticated visitors to login.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Chat says the OpenAI key is missing | `.env` was not created or loaded | Copy `.env.example` to `.env`, set `OPENAI_API_KEY`, and restart the backend. |
| API returns `401` locally | A placeholder API secret is configured on only one side | Remove local `PITCHQUERY_API_SECRET`, or set the same value for both frontend and backend. |
| Frontend cannot reach the API | Backend is stopped or the URL is wrong | Start `pixi run backend`; local default is `http://localhost:8000`. |
| No location chart is produced | Matching rows lack numeric `PlateLocSide`/`PlateLocHeight` | Choose another query or confirm the selected pitch subset. |
| Supabase demo load returns `503` | Production database variables or seeded row are missing | Apply the migration, configure both Supabase variables, and run `pixi run seed-demo`. |
| Build fails after dependency changes | Lockfile and install are out of sync | Run `pixi run frontend-install`, then `pixi run check`. |

## More documentation

- [Architecture and invariants](docs/ARCHITECTURE.md)
- [API contract](docs/API.md)
- [Vercel and Supabase deployment](docs/DEPLOYMENT.md)
- [Contributing and review checklist](CONTRIBUTING.md)
- [Dataset attribution](data/ATTRIBUTION.md)

## Cost note

The test suite injects analysis and gate functions, so tests do not need an OpenAI key. Live chat uses OpenAI Code Interpreter and incurs API usage. Defaults use low reasoning, bounded hosted-tool calls, bounded output, and a daily usage ledger; that ledger covers this application, not other applications sharing the same OpenAI project.
