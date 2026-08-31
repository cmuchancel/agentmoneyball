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


def test_fraction_bounds_apply_to_rates_but_not_averages():
    invalid_rate = packet(metrics=[Metric(name="rate", value=150, unit="percent",
                                          numerator=3, denominator=2)])
    assert "rate: numerator exceeds denominator" in deterministic_checks(invalid_rate)

    average = packet(answer_summary="Average velocity was 95.1 mph.",
                     metrics=[Metric(name="average velocity", value=95.1, unit="mph",
                                     numerator=7893.3, denominator=83)])
    assert deterministic_checks(average) == []


def test_location_chart_supports_dynamic_color_and_shape_features():
    chart = LocationChart(
        title="0-2 locations",
        encodings=[ChartEncoding(feature="pitch_type", channel="color", label="Pitch type"),
                   ChartEncoding(feature="outcome", channel="shape", label="Outcome")],
        points=[LocationPoint(plate_x=-0.2, plate_z=2.4, label="0-2 pitch",
                              features=[ChartFeature(name="pitch_type", value="Slider"),
                                        ChartFeature(name="outcome", value="Swinging strike"),
                                        ChartFeature(name="count", value="0-2")])])
    result = packet(metrics=[], location_chart=chart)
    assert [encoding.channel for encoding in result.location_chart.encodings] == ["color", "shape"]
    assert result.location_chart.points[0].features[-1].value == "0-2"
    assert deterministic_checks(result) == []


def test_location_prompt_requires_partial_data_degradation():
    assert "call\nbuild_pitch_chart exactly once" in ANALYST_SYSTEM_PROMPT
    assert "includes every matching" in ANALYST_SYSTEM_PROMPT
    assert "do not sample" in ANALYST_SYSTEM_PROMPT
    assert "raw StrikeSwinging value (a whiff)" in ANALYST_SYSTEM_PROMPT




def test_daily_usage_guard(tmp_path):
    usage = DailyUsage()
    usage.path = tmp_path / "usage.json"
    usage.limit = 100
    usage.reserve = 20
    usage.add(30)
    assert usage.snapshot()["remaining"] == 70
    usage.add(50)
    with pytest.raises(RuntimeError, match="Daily Agent Moneyball token guard"):
        usage.ensure_capacity()
