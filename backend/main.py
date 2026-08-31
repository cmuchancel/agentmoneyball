from __future__ import annotations

import os
import json
import hmac
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from backend.scouting.context import conversation_messages
from backend.scouting.data import DataValidationError, combine_csv_files, load_and_prepare, profile_for_prompt, save_prepared
from backend.scouting.supabase_store import RemoteDataset, SupabaseStore

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

from backend.scouting.graph import build_graph, daily_usage_snapshot, live_services

STORE = Path(os.getenv("PITCHQUERY_DATA_DIR", "/tmp/pitchquery" if os.getenv("VERCEL") else ROOT / ".data"))
DEMO = ROOT / "data" / "trackman_v3_games"
datasets: dict[str, dict[str, Any]] = {}
graphs: dict[str, Any] = {}
remote_store = SupabaseStore.from_env()

app = FastAPI(
    title="Agent Moneyball API",
    description="Evidence-gated analysis over the bundled TrackMan demo dataset.",
    version="0.1.0",
)
origins = [origin.strip() for origin in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if origin.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def require_api_secret(request, call_next):
    expected = os.getenv("PITCHQUERY_API_SECRET", "")
    if os.getenv("VERCEL") and not expected:
        return JSONResponse({"detail": "API access protection is not configured."}, status_code=503)
    supplied = request.headers.get("X-PitchQuery-Secret", "")
    if expected and not hmac.compare_digest(supplied, expected):
        return JSONResponse({"detail": "Unauthorized."}, status_code=401)
    return await call_next(request)


class ChatRequest(BaseModel):
    thread_id: str
    dataset_id: str
    message: str
    messages: list[dict[str, str]] = Field(default_factory=list)


def register(path: Path, display_name: str, demo_aliases: bool = False) -> dict[str, Any]:
    try:
        frame, profile = load_and_prepare(path, demo_aliases=demo_aliases)
    except DataValidationError as exc:
        raise HTTPException(422, str(exc)) from exc
    prepared = STORE / profile.dataset_id / "pitches.csv"
    save_prepared(frame, prepared)
    profile.file_name = display_name
    datasets[profile.dataset_id] = {"path": prepared, "profile": profile}
    return {"dataset_id": profile.dataset_id, "profile": profile.model_dump()}


def register_many(paths: list[Path], display_name: str, demo_aliases: bool = False) -> dict[str, Any]:
    combined = STORE / "demo-combined.csv"
    return register(combine_csv_files(paths, combined), display_name, demo_aliases=demo_aliases)


def register_remote(data: RemoteDataset) -> dict[str, Any]:
    prepared = STORE / data.dataset_id / "pitches.csv"
    prepared.parent.mkdir(parents=True, exist_ok=True)
    prepared.write_bytes(data.prepared_csv)
    datasets[data.dataset_id] = {
        "path": prepared,
        "profile": data.profile,
        "openai_file_id": data.openai_file_id,
    }
    return {"dataset_id": data.dataset_id, "profile": data.profile.model_dump()}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/datasets")
def load_demo_dataset():
    try:
        if remote_store:
            return register_remote(remote_store.get_demo_dataset())
        if os.getenv("VERCEL"):
            raise RuntimeError("Supabase is not configured for this deployment.")
        demo_files = sorted(DEMO.glob("*.csv"))
        if not demo_files:
            raise RuntimeError("Bundled demo data is not installed.")
        return register_many(demo_files, "21 public TrackMan V3 scrimmage files", demo_aliases=True)
    except (DataValidationError, RuntimeError) as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/api/chat")
def chat(request: ChatRequest):
    data = datasets.get(request.dataset_id)
    if not data and remote_store:
        try:
            remote = remote_store.get_demo_dataset()
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc
        if remote.dataset_id == request.dataset_id:
            register_remote(remote)
            data = datasets.get(request.dataset_id)
    if not data:
        raise HTTPException(404, "Demo dataset not found; reload the page.")
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(503, "Set OPENAI_API_KEY to run AI analysis.")
    state = {"thread_id": request.thread_id, "dataset_id": request.dataset_id,
             "dataset_profile": data["profile"].model_dump(), "question": request.message,
             "messages": conversation_messages(request.messages, request.message), "analysis_attempt": 0,
             "gate_feedback": "", "gate_verdict": {}}

    def events():
        profile = data["profile"]
        yield json.dumps({"type": "progress", "stage": "Question received", "detail":
                          f"Working with {profile.rows:,} pitches across {profile.columns} fields.", "status": "complete"}) + "\n"
        if request.dataset_id not in graphs:
            yield json.dumps({"type": "progress", "stage": "Preparing the dataset tools", "detail":
                              "Loading the prepared CSV into the analysis workspace.", "status": "active"}) + "\n"
            file_id = data.get("openai_file_id")
            if not file_id:
                file_id = OpenAI().files.create(file=data["path"].open("rb"), purpose="assistants").id
                data["openai_file_id"] = file_id
                if remote_store:
                    remote_store.set_openai_file_id(request.dataset_id, file_id)
            runner, gate = live_services(file_id, data["path"], profile_for_prompt(profile))
            graphs[request.dataset_id] = build_graph(runner, gate)
            yield json.dumps({"type": "progress", "stage": "Dataset tools ready", "detail":
                              "The analyst can query pitch data and build complete charts without generating code.", "status": "complete"}) + "\n"
        graph = graphs[request.dataset_id]
        for mode, update in graph.stream(state, stream_mode=["custom", "updates"]):
            if mode == "custom":
                yield json.dumps({"type": "progress", **update}) + "\n"
                continue
            _, value = next(iter(update.items()))
            if "final_answer" in value:
                answer = {**value["final_answer"], "daily_usage": daily_usage_snapshot()}
                yield json.dumps({"type": "result", "data": answer}, default=str) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson")
