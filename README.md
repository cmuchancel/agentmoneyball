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

Open http://localhost:3000. The bundled CSV is a small, explicitly synthetic fixture for trying the interface; upload real authorized TrackMan data for meaningful analysis.

## Verify

```bash
pixi run test
pixi run build
```

The normal test suite uses injected analysis/gate functions and never requires an API key. Live chat uses OpenAI Code Interpreter, so it does require `OPENAI_API_KEY` and incurs API usage.

## Architecture

- `backend/scouting/graph.py`: the complete LangChain analyst + semantic gate + bounded LangGraph loop.
- `backend/scouting/data.py`: CSV validation, structural IDs, and dataset profile.
- `backend/scouting/schemas.py`: Pydantic contracts and deterministic checks.
- `backend/main.py`: two primary FastAPI endpoints.
- `frontend/app/page.tsx`: one-page upload and chat UI.

## Sharing

This folder is ready for Git. Commit it to a private/public GitHub repository and share the repository link, or download the repository as a ZIP. Secrets and generated environments are excluded by `.gitignore`.

