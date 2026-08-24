import json

import pandas as pd

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
