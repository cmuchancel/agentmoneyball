# Architecture

## Design goals

Agent Moneyball is designed around four constraints:

1. Numerical claims must come from executed analysis.
2. Evidence must be checked before a response reaches the user.
3. The public deployment must expose only the bundled demo dataset.
4. Production credentials must never cross the browser boundary.

## Runtime components

| Component | Responsibility |
| --- | --- |
| Next.js web app | Conversation UI, report builder, password session, and same-origin API relay. |
| FastAPI service | Dataset loading, streaming chat endpoint, request authentication, and health checks. |
| LangGraph workflow | Analyst execution, deterministic/schema checks, semantic evidence gate, and bounded revision. |
| OpenAI Code Interpreter | Executes generated Pandas analysis against the prepared CSV. |
| Supabase Postgres | Stores the compressed prepared demo dataset and shared production usage ledger. |
| Vercel | Hosts the frontend and API as separate projects. |

## Request lifecycle

1. An unauthenticated production visitor is redirected to /login.
2. A successful password submission creates an HTTP-only signed session cookie.
3. The browser sends a question to the frontend's /api/chat route.
4. The server-side relay adds X-PitchQuery-Secret and forwards the request.
5. FastAPI authenticates the shared secret and resolves the demo dataset.
6. The analyst generates and executes a bounded analysis.
7. Deterministic checks validate result structure, row counts, rates, and plot data.
8. The evidence gate accepts, revises, or rejects the proposed response.
9. LangGraph progress events stream to the UI as newline-delimited JSON.
10. The UI renders text, metrics, tables, evidence, and optional strike-zone shapes.

The loop has explicit limits on hosted-tool calls, revisions, output size, and daily usage. A failed evidence check does not silently become a confident answer.

## Backend module boundaries

### API layer

- backend/main.py owns HTTP routes, CORS, secret validation, and streaming responses.
- It should translate domain failures into HTTP or stream-level errors, not implement scouting logic.

### Data layer

- backend/scouting/data.py validates CSV inputs, creates structural IDs, attaches fictional aliases, and produces dataset profiles.
- backend/scouting/supabase_store.py persists and retrieves the production demo payload and usage records.
- backend/scouting/usage.py enforces the daily application budget.

### Analysis layer

- backend/scouting/graph.py assembles the analyst/evidence/revision workflow.
- backend/scouting/prompts.py defines the analyst and evidence-gate contracts.
- backend/scouting/chart_tool.py performs deterministic filters, aggregations, derived outcome matching, and plot preparation.
- backend/scouting/schemas.py defines the serialized contracts and deterministic validators.

### Tests

- backend/tests/test_checks.py exercises evidence and API-level behavior.
- backend/tests/test_chart_tool.py covers deterministic query behavior, including whiff aliases and location shapes.
- Tests inject analysis/gate functions so the normal suite does not call OpenAI.

## Frontend module boundaries

- frontend/app/page.tsx coordinates page state, chat submission, report state, and navigation.
- frontend/features/scouting/domain.ts owns feature types, artifact conversion, report-page construction, and display formatting.
- frontend/features/scouting/prompts.ts owns dataset-compatible example prompts.
- frontend/features/scouting/strike-zone.tsx owns interactive strike-zone visualization.
- frontend/features/scouting/analysis-results.tsx owns progress, evidence, metrics, table, and artifact rendering.
- frontend/lib/api.ts owns typed NDJSON streaming and API errors.
- frontend/lib/auth.ts owns server-only password and session helpers.
- frontend/proxy.ts owns the whole-site production access boundary.
- frontend/app/api/* relays browser requests without exposing the backend secret.

New domain behavior should live in the narrowest appropriate module. Keep page.tsx focused on orchestration.

## Data invariants

### Identity

- SourceRowId identifies a row from its source file.
- GameSessionId identifies the source game/session.
- PlateAppearanceId and pitch order support sequence analysis.
- Fictional display names are stable aliases; structural IDs remain the source of truth.

### Pitch outcomes

TrackMan exports contain spelling and naming variants. Deterministic normalization maps supported whiff aliases before filtering or aggregation. Add a regression fixture whenever a new alias is introduced.

### Locations

A rendered pitch location requires finite numeric PlateLocSide and PlateLocHeight. The UI must not manufacture a coordinate for rows that lack one.

### Rates

Every rate presented as evidence must have a traceable numerator and denominator. A bare percentage is insufficient for evidence gating.

### Dataset stability

The prepared demo dataset has 21 files and 3,344 pitches. Its dataset identifier is content-derived so repeated loads are idempotent.

## Failure behavior

| State | Meaning | UI behavior |
| --- | --- | --- |
| success | The answer passed deterministic and semantic evidence checks. | Render answer and artifacts. |
| cannot_answer | Required data is absent or evidence remains inadequate. | Explain the limitation without invented values. |
| error | Authentication, transport, configuration, or execution failed. | Show an actionable failure message. |

## Extension points

- Add a deterministic analysis operation in chart_tool.py, its schema in schemas.py, prompt guidance in prompts.py, and regression tests.
- Add a new artifact type to the shared API types, render it in analysis-results.tsx, and decide how it appears in domain.ts report pages.
- Add a new storage implementation behind the existing dataset-loading boundary rather than importing database code into analysis modules.
- Add a new protected frontend endpoint through the same-origin relay pattern; never use a public environment variable for a server secret.
