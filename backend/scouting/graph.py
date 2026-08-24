from __future__ import annotations

import json
import os
import threading
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

from langchain.agents import create_agent
from langchain_core.callbacks import BaseCallbackHandler
from langchain_openai import ChatOpenAI
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph

from .prompts import ANALYST_SYSTEM_PROMPT, GATE_SYSTEM_PROMPT
from .schemas import AnalysisPacket, AnalysisState, GateVerdict, deterministic_checks

MAX_ATTEMPTS = 3
Runner = Callable[[AnalysisState], AnalysisPacket]
Gate = Callable[[AnalysisState], GateVerdict]


class DailyUsage:
    """Small local guardrail for this app's reported token usage."""
    def __init__(self):
        self.path = Path(os.getenv("PITCHQUERY_USAGE_FILE", Path(__file__).parents[2] / ".data" / "usage.json"))
        self.limit = int(os.getenv("PITCHQUERY_DAILY_TOKEN_LIMIT", "1500000"))
        self.reserve = int(os.getenv("PITCHQUERY_TOKEN_RESERVE", "250000"))
        self.lock = threading.Lock()

    def snapshot(self) -> dict[str, int | str]:
        try: data = json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError): data = {}
        used = int(data.get("tokens", 0)) if data.get("date") == date.today().isoformat() else 0
        return {"date": date.today().isoformat(), "tokens": used, "limit": self.limit,
                "remaining": max(0, self.limit - used)}

    def ensure_capacity(self) -> None:
        usage = self.snapshot()
        if int(usage["tokens"]) >= self.limit - self.reserve:
            raise RuntimeError(f"Daily PitchQuery token guard reached ({usage['tokens']:,}/{self.limit:,}). Try again tomorrow or raise the configured limit.")

    def add(self, tokens: int) -> None:
        if tokens <= 0: return
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


def _text(packet: AnalysisPacket) -> str:
    def metric_text(m) -> str:
        value = f"{m.value:.2f}".rstrip("0").rstrip(".") if isinstance(m.value, float) else str(m.value)
        unit = "%" if m.unit in {"percent", "%"} else f" {m.unit}" if m.unit else ""
        fraction = f" ({m.numerator}/{m.denominator})" if m.denominator is not None else ""
        return f"{m.group + ': ' if m.group else ''}{m.name}: {value}{unit}{fraction}"
    metrics = "; ".join(metric_text(metric) for metric in packet.metrics)
    answer = packet.answer_summary.strip() or metrics or "The analysis completed without a concise result."
    return answer + (f"\n\n**Caution:** {'; '.join(packet.warnings)}" if packet.warnings else "")


def live_services(file_id: str, profile: dict[str, Any]) -> tuple[Runner, Gate]:
    """Create the only two model calls: analyst agent and semantic gate."""
    model_name = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
    callback = UsageCallback()
    model = ChatOpenAI(model=model_name, use_responses_api=True, temperature=0,
                       reasoning_effort="low", max_tokens=16000, callbacks=[callback],
                       extra_body={"max_tool_calls": 6})
    analyst = create_agent(
        model=model,
        tools=[{"type": "code_interpreter", "container": {"type": "auto", "file_ids": [file_id]}}],
        system_prompt=ANALYST_SYSTEM_PROMPT,
        response_format=AnalysisPacket,
    )
    gate_model = ChatOpenAI(model=model_name, use_responses_api=True, temperature=0,
                            reasoning_effort="low", max_tokens=2000,
                            callbacks=[callback]).with_structured_output(GateVerdict)

    def run(state: AnalysisState) -> AnalysisPacket:
        USAGE.ensure_capacity()
        prompt = {
            "question": state["question"],
            "dataset_profile": profile,
            "recent_conversation": state.get("messages", [])[-6:],
            "gate_feedback": state.get("gate_feedback", ""),
            "instruction": "Use the python tool on the uploaded CSV. Maximum six tool calls and three repairs.",
        }
        result = analyst.invoke(
            {"messages": [{"role": "user", "content": json.dumps(prompt, default=str)}]},
            config={"recursion_limit": 14},
        )
        return AnalysisPacket.model_validate(result["structured_response"])

    def gate(state: AnalysisState) -> GateVerdict:
        USAGE.ensure_capacity()
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        return gate_model.invoke(
            [
                ("system", GATE_SYSTEM_PROMPT),
                ("user", json.dumps({"question": state["question"], "packet": packet.model_dump()})),
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
        report("Analyzing the pitch data", f"Attempt {attempt} of {MAX_ATTEMPTS}: inspecting columns, choosing filters, and running Python.", attempt)
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
        report("Analysis attempt failed" if error else "Analysis attempt complete",
               short(error) if error else f"Attempt {attempt} returned a structured result for verification.",
               attempt, "revise" if error else "complete")
        return {"analysis_attempt": attempt, "analysis_packet": packet.model_dump(), "gate_verdict": {}}

    def check_result(state: AnalysisState) -> dict[str, Any]:
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        errors = deterministic_checks(packet, state["question"])
        result: dict[str, Any] = {"deterministic_errors": errors}
        if errors:
            result["gate_feedback"] = "Fix these validation errors: " + "; ".join(errors)
            report("Integrity check requested a revision", errors[0], state["analysis_attempt"], "revise")
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
