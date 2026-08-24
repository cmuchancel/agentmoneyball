from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

from scouting.data import DataValidationError, load_and_prepare, save_prepared
from scouting.graph import build_graph, live_services

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / ".data"
DEMO = ROOT / "data" / "Track_Combo.csv"
datasets: dict[str, dict[str, Any]] = {}
graphs: dict[str, Any] = {}

app = FastAPI(title="PitchQuery", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")],
                   allow_methods=["*"], allow_headers=["*"])


class ChatRequest(BaseModel):
    thread_id: str
    dataset_id: str
    message: str


def register(path: Path, display_name: str) -> dict[str, Any]:
    try:
        frame, profile = load_and_prepare(path)
    except DataValidationError as exc:
        raise HTTPException(422, str(exc)) from exc
    prepared = STORE / profile.dataset_id / "pitches.csv"
    save_prepared(frame, prepared)
    profile.file_name = display_name
    datasets[profile.dataset_id] = {"path": prepared, "profile": profile}
    return {"dataset_id": profile.dataset_id, "profile": profile.model_dump()}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/datasets")
async def upload_dataset(file: UploadFile | None = File(None), use_demo: bool = Form(False)):
    if use_demo:
        if not DEMO.exists():
            raise HTTPException(404, "Bundled demo data is not installed.")
        return register(DEMO, "Synthetic TrackMan-style demo data")
    if not file or not file.filename:
        raise HTTPException(400, "Choose a CSV file.")
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(415, "Only CSV uploads are supported.")
    temp = STORE / "uploads" / f"{uuid.uuid4()}.csv"
    temp.parent.mkdir(parents=True, exist_ok=True)
    with temp.open("wb") as target:
        shutil.copyfileobj(file.file, target)
    return register(temp, file.filename)


@app.post("/api/chat")
def chat(request: ChatRequest):
    data = datasets.get(request.dataset_id)
    if not data:
        raise HTTPException(404, "Dataset not found; upload it again.")
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(503, "Set OPENAI_API_KEY to run AI analysis.")
    if request.dataset_id not in graphs:
        file_id = OpenAI().files.create(file=data["path"].open("rb"), purpose="assistants").id
        runner, gate = live_services(file_id, data["profile"].model_dump())
        graphs[request.dataset_id] = build_graph(runner, gate)
    graph = graphs[request.dataset_id]
    result = graph.invoke(
        {"thread_id": request.thread_id, "dataset_id": request.dataset_id,
         "dataset_profile": data["profile"].model_dump(), "question": request.message,
         "messages": [{"role": "user", "content": request.message}], "analysis_attempt": 0,
         "gate_feedback": ""},
        config={"configurable": {"thread_id": f"{request.dataset_id}:{request.thread_id}"}},
    )
    return result["final_answer"]

