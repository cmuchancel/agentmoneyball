from scouting.graph import build_graph
from scouting.schemas import AnalysisPacket, GateVerdict, Metric


def good_packet():
    return AnalysisPacket(status="success", question_interpreted="slider rate",
                          answer_summary="The pitcher threw sliders on half of these pitches (2 of 4).",
                          method="filtered pandas",
                          filters=["Balls == 0", "Strikes == 2"],
                          metrics=[Metric(name="slider rate", value=50, unit="percent", numerator=2, denominator=4)],
                          sample_size=4, coverage="4 pitches", warnings=["Small sample"],
                          executed_code=["print(result)"], execution_evidence=["50"])


def invoke(graph):
    return graph.invoke({"question": "slider rate?", "analysis_attempt": 0, "messages": [],
                         "thread_id": "t", "dataset_id": "d"},
                        config={"configurable": {"thread_id": "test"}})


def progress_events(graph):
    items = graph.stream({"question": "slider rate?", "analysis_attempt": 0, "messages": [],
                          "thread_id": "t", "dataset_id": "d"},
                         config={"configurable": {"thread_id": "progress-test"}},
                         stream_mode=["custom", "updates"])
    return [item for mode, item in items if mode == "custom"]


def test_pass_route():
    graph = build_graph(lambda state: good_packet(),
                        lambda state: GateVerdict(verdict="pass", reason="complete"))
    result = invoke(graph)
    assert result["final_answer"]["status"] == "success"
    assert result["final_answer"]["answer"].startswith("The pitcher threw sliders")
    assert "**Method:**" not in result["final_answer"]["answer"]
    assert result["analysis_attempt"] == 1


def test_revision_feedback_reaches_second_attempt():
    seen = []
    def run(state):
        seen.append(state.get("gate_feedback", ""))
        return good_packet()
    def gate(state):
        return GateVerdict(verdict="revise", reason="missing split", next_instruction="split by side") \
            if state["analysis_attempt"] == 1 else GateVerdict(verdict="pass", reason="complete")
    result = invoke(build_graph(run, gate))
    assert result["analysis_attempt"] == 2
    assert seen == ["", "split by side"]


def test_gate_cannot_answer_repairs_an_incomplete_successful_packet():
    seen = []
    def run(state):
        seen.append(state.get("gate_feedback", ""))
        return good_packet()
    def gate(state):
        return GateVerdict(verdict="cannot_answer", reason="requested chart is missing") \
            if state["analysis_attempt"] == 1 else GateVerdict(verdict="pass", reason="complete")
    result = invoke(build_graph(run, gate))
    assert result["analysis_attempt"] == 2
    assert seen == ["", "requested chart is missing"]


def test_validation_feedback_reaches_second_attempt():
    seen = []
    def run(state):
        seen.append(state.get("gate_feedback", ""))
        packet = good_packet()
        return packet.model_copy(update={"executed_code": []}) if len(seen) == 1 else packet
    result = invoke(build_graph(run, lambda state: GateVerdict(verdict="pass", reason="complete")))
    assert result["analysis_attempt"] == 2
    assert "successful analysis requires executed code" in seen[1]


def test_attempt_limit_stops_failures():
    bad = good_packet().model_copy(update={"executed_code": []})
    result = invoke(build_graph(lambda state: bad,
                                lambda state: GateVerdict(verdict="pass", reason="unused")))
    assert result["analysis_attempt"] == 3
    assert result["final_answer"]["status"] == "cannot_answer"


def test_cannot_answer_does_not_retry():
    unavailable = good_packet().model_copy(update={"status": "cannot_answer", "metrics": [],
                                                   "executed_code": [], "execution_evidence": [],
                                                   "warnings": ["Model unavailable"]})
    result = invoke(build_graph(lambda state: unavailable,
                                lambda state: GateVerdict(verdict="pass", reason="unused")))
    assert result["analysis_attempt"] == 1
    assert result["final_answer"]["answer"] == "Model unavailable"


def test_progress_stream_explains_revision_and_success():
    def gate(state):
        return GateVerdict(verdict="revise", reason="missing split", next_instruction="split by side") \
            if state["analysis_attempt"] == 1 else GateVerdict(verdict="pass", reason="complete")
    events = progress_events(build_graph(lambda state: good_packet(), gate))
    stages = [event["stage"] for event in events]
    assert "Evidence review requested a revision" in stages
    assert "Evidence review passed" in stages
    assert [event["attempt"] for event in events if event["stage"] == "Analyzing the pitch data"] == [1, 2]
    assert all(event.get("detail") for event in events)


def test_progress_stream_explains_cannot_answer():
    unavailable = good_packet().model_copy(update={"status": "cannot_answer", "metrics": [],
                                                   "executed_code": [], "execution_evidence": [],
                                                   "warnings": ["Model unavailable"]})
    stages = [event["stage"] for event in progress_events(build_graph(
        lambda state: unavailable, lambda state: GateVerdict(verdict="pass", reason="unused")))]
    assert "Stopped without a numerical answer" in stages


def test_new_request_does_not_reuse_old_gate_reason_after_an_exception():
    calls = 0
    def run(state):
        nonlocal calls
        calls += 1
        if calls == 1:
            return good_packet()
        raise RuntimeError("current analysis exception")
    graph = build_graph(run, lambda state: GateVerdict(verdict="pass", reason="old gate reason"))
    assert invoke(graph)["final_answer"]["status"] == "success"
    failed = invoke(graph)
    assert failed["final_answer"]["answer"] == "current analysis exception"


def test_progress_stream_exposes_analysis_exception():
    def fail(state):
        raise RuntimeError("tool execution exploded")
    events = progress_events(build_graph(fail, lambda state: GateVerdict(verdict="pass", reason="unused")))
    failures = [event for event in events if event["stage"] == "Analysis attempt failed"]
    assert len(failures) == 3
    assert failures[0]["detail"] == "tool execution exploded"
