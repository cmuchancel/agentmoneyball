# Agent Moneyball

Agent Moneyball is an evidence-gated baseball scouting assistant. A user asks a plain-English question, the system executes an analysis over pitch-level TrackMan data, checks the evidence, and returns an answer with metrics, tables, or an interactive strike-zone chart.

**Live demo:** [pitchquery-tau.vercel.app](https://pitchquery-tau.vercel.app)

The hosted demo is already configured. Enter the password supplied with the submission; no OpenAI API key or local setup is required to use the live website.

## Project 0 requirements

### Intelligence

Agent Moneyball demonstrates non-trivial computational reasoning instead of returning an unverified chatbot response:

1. A LangGraph analyst interprets the baseball question.
2. The requested analysis is executed against the prepared CSV with Pandas or the deterministic location-chart tool.
3. Structural checks validate filters, sample sizes, rates, coordinates, and evidence.
4. A separate evidence gate either accepts the result, requests a revision, or returns cannot_answer when the data cannot support the claim.

Every displayed number must be traceable to executed evidence. The system is explicitly designed to refuse unsupported questions rather than fabricate an answer.

### Interaction

The user can:

- ask open-ended scouting questions in natural language;
- watch the analysis process stream as it runs;
- inspect written conclusions, metrics, tables, methods, and execution evidence;
- explore pitch locations in an interactive catcher-view strike zone;
- add useful responses to a report;
- reorder report sections and export a US Letter PDF.

### Reproducible implementation

The repository has a clear frontend/backend structure, pinned Python and Node dependencies, an attributed 21-game demo dataset, and one local starting command. A fresh checkout does not require Supabase, Vercel, or any hidden local file.

## Launch locally

### Requirements

- [Pixi](https://pixi.sh)
- An OpenAI API key

### 1. Get the repository

~~~bash
git clone https://github.com/cmuchancel/agentmoneyball.git
cd agentmoneyball
~~~

### 2. Create the environment file

Copy the example:

~~~bash
cp .env.example .env
~~~

Open **.env** and set:

~~~dotenv
OPENAI_API_KEY=your-real-openai-api-key
~~~

Keep SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and PITCHQUERY_API_SECRET blank for localhost. The local app reads the bundled CSV files directly and does not use the production password.

### 3. Launch everything with one command

~~~bash
pixi run app
~~~

That single command:

- creates the pinned Pixi environment when needed;
- installs frontend packages on the first run;
- starts FastAPI at [localhost:8000](http://localhost:8000);
- starts Next.js at [localhost:3000](http://localhost:3000);
- shuts down both services when you press **Ctrl+C**.

Open [http://localhost:3000](http://localhost:3000). The 21-game demo dataset loads automatically.

## Prompts to copy and paste

The bundled names are stable fictional aliases attached to the original source IDs. Caleb Archer is a useful pitcher for a reproducible walkthrough.

These six prompts are intentionally scoped to fields available in the demo dataset. They have also been exercised against the production deployment.

### 1. Whiff location map

~~~text
For pitcher Caleb Archer, plot every swing-and-miss pitch location. Color each point by pitch type and report total whiffs by pitch type.
~~~

This should produce a location chart and a pitch-type breakdown. The known result is 25 whiffs: 20 changeups, 3 fastballs, and 2 sliders.

### 2. Two-strike location plan

~~~text
For pitcher Caleb Archer in 0-2 counts, plot every pitch with a valid location on a catcher-view strike zone. Color by pitch type and use marker shape for pitch outcome.
~~~

### 3. Complete arsenal

~~~text
For pitcher Caleb Archer, summarize his complete arsenal by pitch type. Report pitch count, usage percentage, average release speed in mph, average spin rate in rpm, average horizontal break in inches, and average induced vertical break in inches.
~~~

### 4. Fastball/changeup comparison

~~~text
For pitcher Caleb Archer, compare his fastball and changeup using average velocity, horizontal break, induced vertical break, swinging strikes, and hits allowed. Present the evidence in a table, then end with the two most meaningful scouting takeaways.
~~~

### 5. Fastball velocity leaderboard

~~~text
Which pitcher has the highest average fastball velocity among pitchers with at least 25 fastballs? Answer with the leader in one sentence, then return a descending table with pitcher name, fastball count, and average velocity in mph.
~~~

### 6. Evidence-boundary demonstration

~~~text
For pitcher Caleb Archer, compare performance with runners in scoring position by inning and score differential. If the required baserunner or score-state fields are unavailable, explicitly identify the missing evidence instead of estimating.
~~~

The demo data does not contain the required baserunner and score state. A correct result explains that the question cannot be answered from the available evidence.

## Build and export a report

1. Run one or more prompts from the walkthrough above.
2. Click **Add to report** beneath each response you want to include.
3. Click **Report** in the top navigation.
4. Review the selected responses in the Report Composer.
5. Use the up/down controls to reorder sections or the remove control to omit one.
6. Select **Preview PDF** to inspect the US Letter page layout.
7. Select **Print / Save PDF** in the preview, or **Export PDF** in the composer.
8. In the browser print dialog, choose **Save as PDF**.

Location analyses automatically receive a separate full-chart page when the report needs one.

### Reuse a report recipe for another player

1. Add the desired responses to a report.
2. Enter a template name and select the save button beside it.
3. Choose the saved template and a player from the **Player variable** menu.
4. Select **Generate selected template for player**.
5. Preview and export the regenerated report.

Saved templates store the original questions as reusable recipes and replace the player name when they run.

## Project organization

~~~text
.
├── backend/
│   ├── main.py                    FastAPI routes and streaming API
│   ├── scouting/
│   │   ├── chart_tool.py          Deterministic location filters and charts
│   │   ├── data.py                CSV validation and dataset profiling
│   │   ├── graph.py               Analyst, evidence gate, and revision loop
│   │   ├── prompts.py             Analyst and verifier contracts
│   │   ├── schemas.py             Structured analysis models and checks
│   │   └── supabase_store.py      Production-only storage adapter
│   └── tests/                     Regression and routing tests
├── data/trackman_v3_games/        Bundled 21-game demo dataset
├── docs/                          Architecture, API, and deployment details
├── frontend/
│   ├── app/                       Next.js pages, login, and API relay
│   ├── components/ui/             Reusable interface primitives
│   ├── features/scouting/         Scouting types, prompts, charts, and results
│   └── lib/                       Typed API and authentication helpers
├── scripts/run_local.py           One-command local process launcher
├── scripts/seed_supabase_demo.py  Production demo seeding utility
├── supabase/migrations/           Reproducible production database schema
└── pixi.toml                      Pinned environment and task definitions
~~~

The main page coordinates state and interaction. Baseball calculations, data preparation, visualizations, API transport, authentication, and production storage live in separate modules.

## Dataset and responsible use

The demo contains 3,344 anonymized pitches from 21 TrackMan V3 college scrimmage files, with 32 fictional pitcher aliases and 50 fictional batter aliases. Source IDs remain attached. Private uploads are disabled in the hosted deployment.

See [data/ATTRIBUTION.md](data/ATTRIBUTION.md) for source attribution and CC BY 4.0 terms.

Live analysis uses OpenAI Code Interpreter and may consume API tokens. Tool calls, output, and daily application usage are bounded.

## Technical documentation

- [Architecture and data invariants](docs/ARCHITECTURE.md)
- [Streaming API contract](docs/API.md)
- [Vercel and Supabase deployment](docs/DEPLOYMENT.md)
- [Contribution and review guide](CONTRIBUTING.md)
