from __future__ import annotations

import json
import os
import threading
import uuid
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

from langchain.agents import create_agent
from langchain_core.callbacks import BaseCallbackHandler
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from .chart_tool import create_pitch_chart_tool
from .prompts import ANALYST_SYSTEM_PROMPT, GATE_SYSTEM_PROMPT
from .schemas import AnalysisPacket, AnalysisState, GateVerdict, LocationChart, deterministic_checks
from .supabase_store import SupabaseStore

MAX_ATTEMPTS = 3
Runner = Callable[[AnalysisState], AnalysisPacket]
Gate = Callable[[AnalysisState], GateVerdict]


class DailyUsage:
    """Small local guardrail for Agent Moneyball's reported token usage."""
    def __init__(self):
        self.path = Path(os.getenv("PITCHQUERY_USAGE_FILE", Path(__file__).parents[2] / ".data" / "usage.json"))
        self.limit = int(os.getenv("PITCHQUERY_DAILY_TOKEN_LIMIT", "1500000"))
        self.reserve = int(os.getenv("PITCHQUERY_TOKEN_RESERVE", "250000"))
        self.lock = threading.Lock()
        self.remote = SupabaseStore.from_env()

    def snapshot(self) -> dict[str, int | str]:
        if self.remote:
            return self.remote.usage_snapshot(date.today(), self.limit)
        try: data = json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError): data = {}
        used = int(data.get("tokens", 0)) if data.get("date") == date.today().isoformat() else 0
        return {"date": date.today().isoformat(), "tokens": used, "limit": self.limit,
                "remaining": max(0, self.limit - used)}

    def ensure_capacity(self) -> None:
        usage = self.snapshot()
        if int(usage["tokens"]) >= self.limit - self.reserve:
            raise RuntimeError(f"Daily Agent Moneyball token guard reached ({usage['tokens']:,}/{self.limit:,}). Try again tomorrow or raise the configured limit.")

    def add(self, tokens: int) -> None:
        if tokens <= 0: return
        if self.remote:
            self.remote.add_usage(date.today(), tokens)
            return
        with self.lock:
            usage = self.snapshot(); usage["tokens"] = int(usage["tokens"]) + tokens
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps({"date": usage["date"], "tokens": usage["tokens"]}))


USAGE = DailyUsage()


class UsageCallback(BaseCallbackHandler):
    def on_llm_end(self, response, **kwargs) -> None:
        tokens = 0
        for group in response.generations:
            for generation in group:
                usage = getattr(getattr(generation, "message", None), "usage_metadata", None) or {}
                tokens += int(usage.get("total_tokens") or 0)
        USAGE.add(tokens)


def daily_usage_snapshot() -> dict[str, int | str]:
    return USAGE.snapshot()


def analysis_prompt(state: AnalysisState, profile: dict[str, Any]) -> dict[str, Any]:
    feedback = state.get("gate_feedback", "")
    previous = state.get("analysis_packet") if feedback else None
    if previous and previous.get("location_chart"):
        chart = previous["location_chart"]
        previous = {**previous, "location_chart": {"title": chart["title"],
                    "encodings": chart["encodings"], "point_count": len(chart["points"])}}
    return {
        "question": state["question"],
        "dataset_profile": profile,
        "recent_conversation": state.get("messages", [])[-6:],
        "gate_feedback": feedback,
        "previous_attempt": previous,
        "instruction": "Use build_pitch_chart for location maps and Python only for other new analysis. The backend attaches and preserves tool-built chart points, so never serialize them.",
    }


def _text(packet: AnalysisPacket) -> str:
    def metric_text(m) -> str:
        value = f"{m.value:.2f}".rstrip("0").rstrip(".") if isinstance(m.value, float) else str(m.value)
        unit = "%" if m.unit in {"percent", "%"} else f" {m.unit}" if m.unit else ""
        fraction = f" ({m.numerator}/{m.denominator})" if m.denominator is not None else ""
        return f"{m.group + ': ' if m.group else ''}{m.name}: {value}{unit}{fraction}"
    metrics = "; ".join(metric_text(metric) for metric in packet.metrics)
    answer = packet.answer_summary.strip() or metrics or "The analysis completed without a concise result."
    return answer + (f"\n\n**Caution:** {'; '.join(packet.warnings)}" if packet.warnings else "")


def live_services(file_id: str, path: Path, profile: dict[str, Any]) -> tuple[Runner, Gate]:
    """Create the only two model calls: analyst agent and semantic gate."""
    model_name = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
    callback = UsageCallback()
    model = ChatOpenAI(model=model_name, use_responses_api=True, temperature=0,
                       reasoning_effort="low", max_tokens=16000, callbacks=[callback],
                       extra_body={"max_tool_calls": 6})
    chart_cache: dict[str, dict[str, Any]] = {}
    chart_tool = create_pitch_chart_tool(path, chart_cache)
    analyst = create_agent(
        model=model,
        tools=[chart_tool, {"type": "code_interpreter", "container": {"type": "auto", "file_ids": [file_id]}}],
        system_prompt=ANALYST_SYSTEM_PROMPT,
        response_format=AnalysisPacket,
    )
    gate_model = ChatOpenAI(model=model_name, use_responses_api=True, temperature=0,
                            reasoning_effort="low", max_tokens=2000,
                            callbacks=[callback]).with_structured_output(GateVerdict)

    def run(state: AnalysisState) -> AnalysisPacket:
        USAGE.ensure_capacity()
        request_id = uuid.uuid4().hex
        prompt = {**analysis_prompt(state, profile), "chart_request_id": request_id,
                  "chart_instruction": "Pass chart_request_id unchanged to build_pitch_chart."}
        result = analyst.invoke(
            {"messages": [{"role": "user", "content": json.dumps(prompt, default=str)}]},
            config={"recursion_limit": 14},
        )
        packet = AnalysisPacket.model_validate(result["structured_response"])
        built = chart_cache.pop(request_id, None)
        previous = state.get("analysis_packet", {})
        prior_chart = previous.get("location_chart") if state.get("gate_feedback") and previous.get("status") == "success" else None
        if built or prior_chart:
            chart = built["chart"] if built else LocationChart.model_validate(prior_chart)
            tools = ["build_pitch_chart", *(["python"] if packet.executed_code else [])]
            evidence = packet.execution_evidence
            updates: dict[str, Any] = {"location_chart": chart, "tools_used": tools}
            if built:
                summary = built["summary"]
                evidence = [*evidence, "build_pitch_chart: " + json.dumps(summary)]
                updates.update(sample_size=summary["matching_pitches"],
                               coverage=f"Plotted all {summary['valid_location_pitches']} valid-location pitches "
                                        f"from {summary['matching_pitches']} matching pitches; "
                                        f"{summary['missing_location_pitches']} lacked a usable location.")
            packet = packet.model_copy(update={"execution_evidence": evidence, **updates})
        return packet

    def gate(state: AnalysisState) -> GateVerdict:
        USAGE.ensure_capacity()
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        payload = packet.model_dump()
        if packet.location_chart:
            payload["location_chart"] = {"title": packet.location_chart.title,
                "encodings": [encoding.model_dump() for encoding in packet.location_chart.encodings],
                "point_count": len(packet.location_chart.points)}
        return gate_model.invoke(
            [
                ("system", GATE_SYSTEM_PROMPT),
                ("user", json.dumps({"question": state["question"], "packet": payload})),
            ]
        )

    return run, gate


def build_graph(run: Runner, gate: Gate):
    def short(text: str, limit: int = 180) -> str:
        text = " ".join(text.split())
        return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"

    def report(stage: str, detail: str, attempt: int | None = None, status: str = "active") -> None:
        event: dict[str, Any] = {"stage": stage, "detail": detail, "status": status}
        if attempt is not None:
            event["attempt"] = attempt
        get_stream_writer()(event)

    def run_analysis(state: AnalysisState) -> dict[str, Any]:
        attempt = state.get("analysis_attempt", 0) + 1
        repairing = state.get("analysis_packet", {}).get("status") == "success" and bool(state.get("gate_feedback"))
        report("Repairing the verified result" if repairing else "Analyzing the pitch data",
               f"Attempt {attempt} of {MAX_ATTEMPTS}: preserving the executed chart and correcting the requested fields."
               if repairing else f"Attempt {attempt} of {MAX_ATTEMPTS}: choosing filters and calling the dataset tools.", attempt)
        error = ""
        try:
            packet = run({**state, "analysis_attempt": attempt})
        except Exception as exc:
            error = str(exc)
            access_error = any(code in error for code in ("401", "403", "model_not_found", "insufficient_quota"))
            packet = AnalysisPacket(
                status="cannot_answer" if access_error else "error",
                question_interpreted=state["question"], answer_summary="",
                method="Execution failed", coverage="Unknown",
                warnings=["OpenAI rejected the configured model or credentials. Check project model access and API billing." if access_error else error],
                execution_evidence=[],
            )
        packet_error = error or (packet.warnings[0] if packet.status == "error" and packet.warnings else "")
        if packet.location_chart and "build_pitch_chart" in packet.tools_used:
            report("Pitch map assembled", f"Loaded all {len(packet.location_chart.points):,} valid pitch locations from the dataset.",
                   attempt, "complete")
        report("Analysis attempt failed" if packet_error else "Analysis attempt complete",
               short(packet_error) if packet_error else f"Attempt {attempt} returned a structured result for verification.",
               attempt, "revise" if packet_error else "complete")
        return {"analysis_attempt": attempt, "analysis_packet": packet.model_dump(), "gate_verdict": {}}

    def check_result(state: AnalysisState) -> dict[str, Any]:
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        errors = deterministic_checks(packet, state["question"])
        result: dict[str, Any] = {"deterministic_errors": errors}
        if errors:
            result["gate_feedback"] = "Fix these validation errors: " + "; ".join(errors)
            detail = packet.warnings[0] if packet.status == "error" and packet.warnings else errors[0]
            report("Integrity check requested a revision", short(detail), state["analysis_attempt"], "revise")
        else:
            report("Integrity checks passed", "Executed evidence and hard arithmetic checks are internally consistent.", state["analysis_attempt"], "complete")
        return result

    def semantic_gate(state: AnalysisState) -> dict[str, Any]:
        report("Reviewing answer coverage", "The evidence gate is checking the requested filters, definitions, and supporting output.", state["analysis_attempt"])
        verdict = gate(state)
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        if verdict.verdict == "cannot_answer" and packet.status == "success" and state["analysis_attempt"] < MAX_ATTEMPTS:
            verdict = verdict.model_copy(update={"verdict": "revise",
                                                  "next_instruction": verdict.next_instruction or verdict.reason})
        detail = short(verdict.next_instruction or verdict.reason)
        if verdict.verdict == "pass":
            report("Evidence review passed", short(verdict.reason), state["analysis_attempt"], "complete")
        elif verdict.verdict == "revise":
            report("Evidence review requested a revision", detail, state["analysis_attempt"], "revise")
        else:
            report("Evidence review stopped the answer", short(verdict.reason), state["analysis_attempt"], "stopped")
        return {"gate_verdict": verdict.model_dump(), "gate_feedback": verdict.next_instruction}

    def finalize(state: AnalysisState) -> dict[str, Any]:
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        report("Preparing the verified answer", "Formatting the calculated result and its evidence for display.", state["analysis_attempt"], "complete")
        return {"final_answer": {"status": "success", "answer": _text(packet), **packet.model_dump()}}

    def cannot_answer(state: AnalysisState) -> dict[str, Any]:
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        verdict = state.get("gate_verdict", {})
        reason = packet.warnings[0] if packet.status == "error" and packet.warnings else \
            verdict.get("reason") or (packet.warnings[0] if packet.warnings else "; ".join(state.get("deterministic_errors", [])))
        if packet.missing_fields:
            reason = f"Required fields are missing: {', '.join(packet.missing_fields)}. {reason}"
        report("Stopped without a numerical answer", reason or "The result could not be verified.", state["analysis_attempt"], "stopped")
        return {"final_answer": {
            "status": "cannot_answer", "answer": reason or "The result could not be verified.",
            **packet.model_dump(exclude={"status"}),
        }}

    def after_check(state: AnalysisState) -> str:
        if AnalysisPacket.model_validate(state["analysis_packet"]).status == "cannot_answer":
            return "cannot_answer"
        if not state.get("deterministic_errors"):
            return "semantic_gate"
        return "run_analysis" if state["analysis_attempt"] < MAX_ATTEMPTS else "cannot_answer"

    def after_gate(state: AnalysisState) -> str:
        verdict = state["gate_verdict"]["verdict"]
        if verdict == "pass":
            return "finalize"
        if verdict == "revise" and state["analysis_attempt"] < MAX_ATTEMPTS:
            return "run_analysis"
        return "cannot_answer"

    graph = StateGraph(AnalysisState)
    for name, node in (("run_analysis", run_analysis), ("check_result", check_result),
                       ("semantic_gate", semantic_gate), ("finalize", finalize),
                       ("cannot_answer", cannot_answer)):
        graph.add_node(name, node)
    graph.add_edge(START, "run_analysis")
    graph.add_edge("run_analysis", "check_result")
    graph.add_conditional_edges("check_result", after_check)
    graph.add_conditional_edges("semantic_gate", after_gate)
    graph.add_edge("finalize", END)
    graph.add_edge("cannot_answer", END)
    return graph.compile()
