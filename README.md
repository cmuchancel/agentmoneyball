# PitchQuery

PitchQuery turns ordinary baseball questions into executed Pandas analyses over an uploaded TrackMan-style CSV, then runs a separate evidence gate before showing any numerical answer.

## Run with Pixi

Install [Pixi](https://pixi.sh), then from this folder:

```bash
pixi install
pixi run frontend-install
cp .env.example .env
# Add an OpenAI API key to .env, then:
pixi run backend
```

In a second terminal:

```bash
pixi run frontend
```

Open http://localhost:3000. The bundled `data/trackman_v3_games` folder contains 3,344 anonymized pitches split across 21 TrackMan V3 college scrimmage files. PitchQuery accepts either one CSV or a folder of game CSVs. See [data/ATTRIBUTION.md](data/ATTRIBUTION.md) for the data source and CC BY 4.0 terms.

## Verify

```bash
pixi run test
pixi run build
```

The normal test suite uses injected analysis/gate functions and never requires an API key. Live chat uses OpenAI Code Interpreter, so it does require `OPENAI_API_KEY` and incurs API usage.

PitchQuery defaults to `gpt-5.4-mini`, low reasoning, six hosted tool calls, and bounded output. A local daily usage ledger stops new analyses at 1.25M reported tokens against the default 1.5M app limit, leaving 250K headroom for an in-flight analysis. This ledger does not include other applications using the same OpenAI project.

## Architecture

- `backend/scouting/graph.py`: the complete LangChain analyst + semantic gate + bounded LangGraph loop.
- `backend/scouting/data.py`: CSV validation, structural IDs, and dataset profile.
- `backend/scouting/schemas.py`: Pydantic contracts and deterministic checks.
- `backend/main.py`: two primary FastAPI endpoints.
- `frontend/app/page.tsx`: one-page upload and chat UI.

The backend streams real LangGraph node and revision events into a live UI timeline. No extra “observer” model call is used, so process visibility adds no AI token cost.

The frontend uses source-installed ElevenLabs UI `Conversation`, `Message`, `Response`, and `ShimmeringText` components. It does not connect to an ElevenLabs Agent ID; streamed progress comes from the LangGraph analysis workflow.

## Sharing

This folder is ready for Git. Commit it to a private/public GitHub repository and share the repository link, or download the repository as a ZIP. Secrets and generated environments are excluded by `.gitignore`.
