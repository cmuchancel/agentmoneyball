from __future__ import annotations

import os
import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from backend.scouting.context import conversation_messages
from backend.scouting.data import DataValidationError, combine_csv_files, load_and_prepare, profile_for_prompt, save_prepared

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

from backend.scouting.graph import build_graph, daily_usage_snapshot, live_services

STORE = ROOT / ".data"
DEMO = ROOT / "data" / "trackman_v3_games"
datasets: dict[str, dict[str, Any]] = {}
graphs: dict[str, Any] = {}

app = FastAPI(title="PitchQuery", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
                   allow_methods=["*"], allow_headers=["*"])


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
    combined = STORE / "uploads" / f"{uuid.uuid4()}-combined.csv"
    return register(combine_csv_files(paths, combined), display_name, demo_aliases=demo_aliases)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/datasets")
async def upload_dataset(file: UploadFile | None = File(None), files: list[UploadFile] | None = File(None),
                         use_demo: bool = Form(False)):
    if use_demo:
        demo_files = sorted(DEMO.glob("*.csv"))
        if not demo_files:
            raise HTTPException(404, "Bundled demo data is not installed.")
        return register_many(demo_files, "21 public TrackMan V3 scrimmage files", demo_aliases=True)
    uploads = files or ([file] if file else [])
    if not uploads:
        raise HTTPException(400, "Choose a CSV file or folder.")
    batch = STORE / "uploads" / str(uuid.uuid4())
    saved: list[Path] = []
    for upload in uploads:
        name = Path(upload.filename or "").name
        if not name.lower().endswith(".csv"):
            raise HTTPException(415, f"Only CSV uploads are supported ({name or 'unnamed file'}).")
        target = batch / f"{len(saved) + 1:03d}-{name}"
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as output:
            shutil.copyfileobj(upload.file, output)
        saved.append(target)
    return register(saved[0], Path(uploads[0].filename or "upload.csv").name) if len(saved) == 1 \
        else register_many(saved, f"{len(saved)} uploaded CSV files")


@app.post("/api/chat")
def chat(request: ChatRequest):
    data = datasets.get(request.dataset_id)
    if not data:
        raise HTTPException(404, "Dataset not found; upload it again.")
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
            file_id = OpenAI().files.create(file=data["path"].open("rb"), purpose="assistants").id
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
