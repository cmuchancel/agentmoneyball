from scouting.graph import build_graph
from scouting.schemas import AnalysisPacket, GateVerdict, Metric


def good_packet():
    return AnalysisPacket(status="success", question_interpreted="slider rate", method="filtered pandas",
                          filters=["Balls == 0", "Strikes == 2"],
                          metrics=[Metric(name="slider rate", value=50, unit="percent", numerator=2, denominator=4)],
                          sample_size=4, coverage="4 pitches", warnings=["Small sample"],
                          executed_code=["print(result)"], execution_evidence=["50"])


def invoke(graph):
    return graph.invoke({"question": "slider rate?", "analysis_attempt": 0, "messages": [],
                         "thread_id": "t", "dataset_id": "d"},
                        config={"configurable": {"thread_id": "test"}})


def test_pass_route():
    graph = build_graph(lambda state: good_packet(),
                        lambda state: GateVerdict(verdict="pass", reason="complete"))
    result = invoke(graph)
    assert result["final_answer"]["status"] == "success"
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
