import json

import pandas as pd
import pytest

from scouting.chart_tool import create_pitch_chart_tool


def test_chart_tool_keeps_every_pitch_and_classifies_whiffs(tmp_path):
    path = tmp_path / "pitches.csv"
    pd.DataFrame({
        "_source_row_id": [0, 1, 2],
        "PitcherName": ["Ben Ellis"] * 3,
        "PlateLocSide": [-0.2, 0.4, -4.1],
        "PlateLocHeight": [2.5, 1.8, 0.3],
        "TaggedPitchType": ["Fastball", "Slider", "ChangeUp"],
        "PitchCall": ["StrikeSwinging", "StrikeCalled", "BallCalled"],
        "PlayResult": [None, None, None],
    }).to_csv(path, index=False)
    cache = {}
    chart_tool = create_pitch_chart_tool(path, cache)

    summary = json.loads(chart_tool.invoke({
        "request_id": "request-1",
        "filters": [{"column": "PitcherName", "operator": "eq", "value": "Ben Ellis"}],
        "color_by": "TaggedPitchType", "shape_by": "Outcome", "title": "Ben Ellis locations",
    }))

    assert summary["valid_location_pitches"] == 3
    assert summary["feature_counts"]["Outcome"]["Swinging strike"] == 1
    assert len(cache["request-1"]["chart"].points) == 3
    assert cache["request-1"]["chart"].points[-1].plate_x == -4.1


@pytest.mark.parametrize("column,value", [
    ("PitchCall", "StrikeSwinging"),
    ("PitchCall", "SwingingStrike"),
    ("PitchCall", "whiffs"),
    ("PitchCall", "swings and misses"),
    ("Outcome", "Swinging strike"),
    ("Outcome", "whiff"),
])
def test_chart_tool_normalizes_whiff_filters(tmp_path, column, value):
    path = tmp_path / "pitches.csv"
    pd.DataFrame({
        "_source_row_id": [0, 1],
        "PitcherName": ["Caleb Archer"] * 2,
        "PlateLocSide": [-0.2, 0.4],
        "PlateLocHeight": [2.5, 1.8],
        "TaggedPitchType": ["ChangeUp", "Fastball"],
        "PitchCall": ["StrikeSwinging", "StrikeCalled"],
        "PlayResult": [None, None],
    }).to_csv(path, index=False)
    cache = {}
    chart_tool = create_pitch_chart_tool(path, cache)

    summary = json.loads(chart_tool.invoke({
        "request_id": "whiff-alias",
        "filters": [
            {"column": "PitcherName", "operator": "eq", "value": "Caleb Archer"},
            {"column": column, "operator": "eq", "value": value},
        ],
        "color_by": "TaggedPitchType",
    }))

    assert summary["matching_pitches"] == 1
    assert summary["valid_location_pitches"] == 1
    assert len(cache["whiff-alias"]["chart"].points) == 1


def test_chart_tool_preserves_special_and_unrecognized_outcomes_without_other(tmp_path):
    path = tmp_path / "pitches.csv"
    pd.DataFrame({
        "_source_row_id": range(6),
        "PlateLocSide": [0.0] * 6,
        "PlateLocHeight": [2.0] * 6,
        "TaggedPitchType": ["Fastball", "Slider", "ChangeUp", "Curveball", "Cutter", "Splitter"],
        "PitchCall": ["HitByPitch", "BallIntentional", "WildPitch", "PassedBall", "InPlay", "InPlay"],
        "PlayResult": [None, None, None, None, "Error", "Single"],
    }).to_csv(path, index=False)
    cache = {}
    tool = create_pitch_chart_tool(path, cache)

    summary = json.loads(tool.invoke({"request_id": "special", "shape_by": "Outcome"}))
    outcomes = summary["feature_counts"]["Outcome"]

    assert outcomes == {
        "Hit by pitch": 1, "Intentional ball": 1, "Wild pitch": 1, "Passed ball": 1,
        "Reached on error": 1, "Hit": 1,
    }
    assert "Other" not in outcomes
