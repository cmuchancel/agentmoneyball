from __future__ import annotations

import json
import os
from collections.abc import Callable
from typing import Any

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from .prompts import ANALYST_SYSTEM_PROMPT, GATE_SYSTEM_PROMPT
from .schemas import AnalysisPacket, AnalysisState, GateVerdict, deterministic_checks

MAX_ATTEMPTS = 3
Runner = Callable[[AnalysisState], AnalysisPacket]
Gate = Callable[[AnalysisState], GateVerdict]


def _text(packet: AnalysisPacket) -> str:
    metrics = "; ".join(
        f"{m.group + ': ' if m.group else ''}{m.name}: {m.value}{m.unit or ''}"
        + (f" ({m.numerator}/{m.denominator})" if m.denominator is not None else "")
        for m in packet.metrics
    )
    answer = metrics or "See the result table."
    return (
        f"{answer}\n\n**Method:** {packet.method}\n\n"
        f"**Sample:** n={packet.sample_size if packet.sample_size is not None else 'not applicable'}  \n"
        f"**Filters:** {', '.join(packet.filters) or 'none'}  \n"
        f"**Coverage:** {packet.coverage}"
        + (f"\n\n**Caution:** {'; '.join(packet.warnings)}" if packet.warnings else "")
    )


def live_services(file_id: str, profile: dict[str, Any]) -> tuple[Runner, Gate]:
    """Create the only two model calls: analyst agent and semantic gate."""
    model_name = os.getenv("OPENAI_MODEL", "gpt-5-mini")
    model = ChatOpenAI(model=model_name, use_responses_api=True, temperature=0)
    analyst = create_agent(
        model=model,
        tools=[{"type": "code_interpreter", "container": {"type": "auto", "file_ids": [file_id]}}],
        system_prompt=ANALYST_SYSTEM_PROMPT,
        response_format=AnalysisPacket,
    )
    gate_model = ChatOpenAI(model=model_name, use_responses_api=True, temperature=0).with_structured_output(GateVerdict)

    def run(state: AnalysisState) -> AnalysisPacket:
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
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        return gate_model.invoke(
            [
                ("system", GATE_SYSTEM_PROMPT),
                ("user", json.dumps({"question": state["question"], "packet": packet.model_dump()})),
            ]
        )

    return run, gate


def build_graph(run: Runner, gate: Gate):
    def run_analysis(state: AnalysisState) -> dict[str, Any]:
        attempt = state.get("analysis_attempt", 0) + 1
        try:
            packet = run({**state, "analysis_attempt": attempt})
        except Exception as exc:
            packet = AnalysisPacket(
                status="error", question_interpreted=state["question"], method="Execution failed",
                coverage="Unknown", warnings=[str(exc)], execution_evidence=[],
            )
        return {"analysis_attempt": attempt, "analysis_packet": packet.model_dump()}

    def check_result(state: AnalysisState) -> dict[str, Any]:
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        return {"deterministic_errors": deterministic_checks(packet, state["question"])}

    def semantic_gate(state: AnalysisState) -> dict[str, Any]:
        verdict = gate(state)
        return {"gate_verdict": verdict.model_dump(), "gate_feedback": verdict.next_instruction}

    def finalize(state: AnalysisState) -> dict[str, Any]:
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        return {"final_answer": {"status": "success", "answer": _text(packet), **packet.model_dump()}}

    def cannot_answer(state: AnalysisState) -> dict[str, Any]:
        packet = AnalysisPacket.model_validate(state["analysis_packet"])
        verdict = state.get("gate_verdict", {})
        reason = verdict.get("reason") or "; ".join(state.get("deterministic_errors", []))
        if packet.missing_fields:
            reason = f"Required fields are missing: {', '.join(packet.missing_fields)}. {reason}"
        return {"final_answer": {
            "status": "cannot_answer", "answer": reason or "The result could not be verified.",
            **packet.model_dump(exclude={"status"}),
        }}

    def after_check(state: AnalysisState) -> str:
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
    return graph.compile(checkpointer=InMemorySaver())

