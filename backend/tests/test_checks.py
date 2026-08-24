from scouting.schemas import AnalysisPacket, Metric, deterministic_checks
from scouting.graph import DailyUsage
import pytest


def packet(**changes):
    base = dict(status="success", question_interpreted="q", answer_summary="The rate was 50% (1 of 2).",
                method="pandas", filters=[],
                metrics=[Metric(name="rate", value=50, unit="percent", numerator=1, denominator=2)],
                sample_size=30, coverage="all rows", executed_code=["print(1)"],
                execution_evidence=["1"])
    base.update(changes)
    return AnalysisPacket(**base)


def test_valid_packet_passes():
    assert deterministic_checks(packet()) == []


def test_bad_rate_and_missing_evidence_fail():
    result = deterministic_checks(packet(metrics=[Metric(name="rate", value=70, unit="percent",
                                                          numerator=1, denominator=2)], executed_code=[]))
    assert any("executed code" in error for error in result)
    assert any("disagrees" in error for error in result)




def test_daily_usage_guard(tmp_path):
    usage = DailyUsage()
    usage.path = tmp_path / "usage.json"
    usage.limit = 100
    usage.reserve = 20
    usage.add(30)
    assert usage.snapshot()["remaining"] == 70
    usage.add(50)
    with pytest.raises(RuntimeError, match="Daily PitchQuery token guard"):
        usage.ensure_capacity()
