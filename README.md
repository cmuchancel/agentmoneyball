# Agent Moneyball

Agent Moneyball is an evidence-gated baseball scouting assistant. A user asks a plain-English question, the system executes an analysis over pitch-level TrackMan data, checks the evidence, and returns an answer with metrics, tables, or an interactive strike-zone chart.

**Live demo:** [pitchquery-tau.vercel.app](https://pitchquery-tau.vercel.app)

The hosted demo is already configured. Enter the password supplied with the submission; no OpenAI API key or local setup is required to use the live website.

## Project 0 requirements

### Intelligence

Agent Moneyball turns free-form, natural-language scouting questions into structured data analysis over a large, complex pitch-level dataset. A coach or player can ask a new question in ordinary baseball language instead of writing SQL, building a Pandas workflow, learning the database schema, or waiting for a statistics team to run the query.

This is more than a chatbot wrapped around a fixed set of queries. The system performs a new reasoning and execution cycle for each question:

1. A LangGraph analyst interprets the user's intent and identifies the relevant players, pitch types, counts, outcomes, measurements, and comparisons.
2. It translates that request into an analysis plan and executable data-analysis code, then runs the code against 3,344 pitches and 145 TrackMan fields.
3. Structural checks confirm that the calculations use the intended filters, sample sizes, rates, coordinates, and source evidence.
4. A separate evidence gate reviews the result. It can accept the analysis, send it back for revision, or explain that the dataset cannot answer the question.

The intelligence comes from dynamically deciding how to answer an open-ended question, carrying out the required computation, and checking whether the result is supported—not from selecting a prewritten response. Every displayed number must be traceable to executed evidence.

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
For pitcher Caleb Archer in 0-2 counts, plot his pitch locations on a strike-zone chart. Color by pitch type and use marker shape for pitch outcome.
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
For pitcher Caleb Archer, how does his performance with runners in scoring position vary by inning and score differential?
~~~

The demo dataset does not record baserunner or score state, so the assistant should explain that it cannot make this comparison.

## Build and export a report

After running all six example prompts above:

1. Return to the response for **Whiff location map** and click **Add to report**.
2. Add **Two-strike location plan** and **Complete arsenal** the same way. The **Report** button in the top navigation should now show three selected responses.
3. Click **Report** to open the Report Composer.
4. Review the three sections and use the up/down controls if you want to change their order.
5. Leave the template name as **Pitcher Advance Report**, or enter another name, and click the save button beside it. Saving the template makes these same analyses reusable for another pitcher.
6. Select **Preview PDF** and inspect every US Letter page.
7. Select **Print / Save PDF** in the preview, or **Export PDF** in the composer.
8. In the browser print dialog, choose **Save as PDF**.

Location analyses automatically receive a separate full-chart page when the report needs one.
Long result tables automatically continue onto additional numbered pages, with their column headers repeated so no rows are dropped from the PDF.

### Apply the same report to Finn Mercer

If a coach likes the statistics and scouting views in the Caleb Archer report, Agent Moneyball can run those same analyses for another pitcher without rebuilding the report one question at a time:

1. In the Report Composer, choose the saved **Pitcher Advance Report** template.
2. Choose **Finn Mercer** from the **Player variable** menu.
3. Select **Generate selected template for player**.
4. Wait while Agent Moneyball reruns all three questions against Finn Mercer's pitches. The new responses are automatically added to the report.
5. Review the updated conclusions, preview the new PDF, and export it.

The saved template reuses the questions and report structure—not Caleb Archer's old numbers. Each analysis is executed again against Finn Mercer's data and verified before it appears in the new report.

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
