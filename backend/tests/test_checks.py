from scouting.schemas import (AnalysisPacket, ChartEncoding, ChartFeature, LocationChart,
                              LocationPoint, Metric, deterministic_checks)
from scouting.graph import DailyUsage
from scouting.prompts import ANALYST_SYSTEM_PROMPT
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


def test_location_chart_supports_dynamic_color_and_shape_features():
    chart = LocationChart(
        title="0-2 locations",
        encodings=[ChartEncoding(feature="pitch_type", channel="color", label="Pitch type"),
                   ChartEncoding(feature="outcome", channel="shape", label="Outcome")],
        points=[LocationPoint(plate_x=-0.2, plate_z=2.4, label="0-2 pitch",
                              features=[ChartFeature(name="pitch_type", value="Slider"),
                                        ChartFeature(name="outcome", value="Swinging strike"),
                                        ChartFeature(name="count", value="0-2")])])
    result = packet(location_chart=chart)
    assert [encoding.channel for encoding in result.location_chart.encodings] == ["color", "shape"]
    assert result.location_chart.points[0].features[-1].value == "0-2"


def test_location_prompt_requires_partial_data_degradation():
    assert "drop only" in ANALYST_SYSTEM_PROMPT
    assert "never emit an invalid plate_x or plate_z" in ANALYST_SYSTEM_PROMPT
    assert "at most 80 deterministic representative points" in ANALYST_SYSTEM_PROMPT
    assert "plotted P of N pitches with valid locations from T matching pitches" in ANALYST_SYSTEM_PROMPT
    assert '"Hit" means InPlay plus Single, Double, Triple, or HomeRun' in ANALYST_SYSTEM_PROMPT




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
