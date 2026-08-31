from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from langchain_core.tools import tool
from pydantic import BaseModel, Field

from .schemas import ChartEncoding, ChartFeature, LocationChart, LocationPoint


class PitchFilter(BaseModel):
    column: str
    operator: Literal["eq", "ne", "gt", "gte", "lt", "lte", "in"] = "eq"
    value: str | list[str]


class PitchChartInput(BaseModel):
    request_id: str
    filters: list[PitchFilter] = Field(default_factory=list)
    color_by: str | None = None
    shape_by: str | None = None
    title: str = "Pitch locations"


WHIFF_FILTER_VALUES = {
    "strikeswinging", "swingingstrike", "swingingstrikes", "swingandmiss",
    "swingandmisses", "swingsandmisses", "whiff", "whiffs",
}


def _filter_key(column: str, value: Any) -> str:
    text = str(value).strip().casefold()
    compact = re.sub(r"[^a-z0-9]+", "", text)
    if column in {"PitchCall", "Outcome"} and compact in WHIFF_FILTER_VALUES:
        return "__whiff__"
    return text


def _outcome(frame: pd.DataFrame) -> pd.Series:
    calls = frame["PitchCall"].fillna("").astype(str)
    known = calls.map({
        "BallCalled": "Ball", "BallinDirt": "Ball in dirt", "StrikeCalled": "Called strike",
        "StrikeSwinging": "Swinging strike", "FoulBall": "Foul", "HitByPitch": "Hit by pitch",
        "BallIntentional": "Intentional ball", "InPlay": "In play",
    })
    raw = calls.map(lambda value: re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value).strip().capitalize()
                    if value.strip() else "Unclassified")
    result = known.fillna(raw)
    if "PlayResult" in frame:
        play = frame["PlayResult"].fillna("").astype(str)
        in_play = calls.eq("InPlay")
        result = result.mask(in_play & play.isin(["Single", "Double", "Triple", "HomeRun"]), "Hit")
        result = result.mask(in_play & play.eq("Out"), "In play out")
        result = result.mask(in_play & play.eq("Sacrifice"), "Sacrifice")
        result = result.mask(in_play & play.eq("FieldersChoice"), "Fielder's choice")
        result = result.mask(in_play & play.eq("Error"), "Reached on error")
    return result


def _feature(frame: pd.DataFrame, name: str) -> pd.Series:
    if name == "Outcome":
        return _outcome(frame)
    if name == "Count" and {"Balls", "Strikes"}.issubset(frame.columns):
        return frame["Balls"].fillna("?").astype(str) + "-" + frame["Strikes"].fillna("?").astype(str)
    if name not in frame:
        raise ValueError(f"Column {name!r} is not available.")
    return frame[name].fillna("Unknown").astype(str)


def _filtered(frame: pd.DataFrame, filters: list[PitchFilter]) -> pd.DataFrame:
    keep = pd.Series(True, index=frame.index)
    for item in filters:
        if item.column in {"Outcome", "Count"}:
            series = _feature(frame, item.column)
        elif item.column in frame:
            series = frame[item.column]
        else:
            raise ValueError(f"Column {item.column!r} is not available.")
        values = item.value if isinstance(item.value, list) else [item.value]
        if item.operator in {"gt", "gte", "lt", "lte"}:
            numeric = pd.to_numeric(series, errors="coerce")
            target = float(values[0])
            match = {"gt": numeric.gt, "gte": numeric.ge, "lt": numeric.lt, "lte": numeric.le}[item.operator](target)
        else:
            lowered = series.fillna("").map(lambda value: _filter_key(item.column, value))
            targets = [_filter_key(item.column, value) for value in values]
            match = lowered.isin(targets)
            if item.operator == "ne":
                match = ~match
            elif item.operator not in {"eq", "in"}:
                raise ValueError(f"Operator {item.operator!r} is not supported.")
        keep &= match.fillna(False)
    return frame.loc[keep].copy()


def create_pitch_chart_tool(path: Path, cache: dict[str, dict[str, Any]]):
    @tool(args_schema=PitchChartInput)
    def build_pitch_chart(request_id: str, filters: list[PitchFilter], color_by: str | None = None,
                          shape_by: str | None = None, title: str = "Pitch locations") -> str:
        """Build a complete pitch-location chart from exact dataset filters. Filters accept source columns plus
        derived Outcome and Count; common whiff aliases map to raw PitchCall=StrikeSwinging. color_by and shape_by
        accept the same derived features. Every matching pitch with numeric PlateLocSide and PlateLocHeight is
        included; the model must not create or serialize chart points.
        """
        try:
            frame = _filtered(pd.read_csv(path, low_memory=False), filters)
            x = pd.to_numeric(frame["PlateLocSide"], errors="coerce")
            z = pd.to_numeric(frame["PlateLocHeight"], errors="coerce")
            located = frame.loc[x.notna() & z.notna() & np.isfinite(x) & np.isfinite(z)].copy()
            located["_plate_x"] = x.loc[located.index]
            located["_plate_z"] = z.loc[located.index]
            features = [name for name in (color_by, shape_by) if name]
            values = {name: _feature(located, name) for name in features}
            points = [LocationPoint(
                plate_x=row["_plate_x"], plate_z=row["_plate_z"],
                features=[ChartFeature(name=name, value=values[name].loc[index]) for name in features],
                label=f"Pitch {int(row['_source_row_id']) + 1}" if "_source_row_id" in located else "",
            ) for index, row in located.iterrows()]
            if not points:
                return json.dumps({"error": "No matching pitches have numeric plate locations.",
                                   "matching_pitches": len(frame)})
            labels = {"TaggedPitchType": "Pitch type", "Outcome": "Outcome", "Count": "Count"}
            encodings = [ChartEncoding(feature=name, channel=channel, label=labels.get(name, name))
                         for name, channel in ((color_by, "color"), (shape_by, "shape")) if name]
            chart = LocationChart(title=title, encodings=encodings, points=points)
            counts = {name: values[name].value_counts().to_dict() for name in features}
            summary = {"matching_pitches": len(frame), "valid_location_pitches": len(points),
                       "missing_location_pitches": len(frame) - len(points), "feature_counts": counts}
            cache[request_id] = {"chart": chart, "summary": summary}
            return json.dumps(summary)
        except (KeyError, TypeError, ValueError) as exc:
            return json.dumps({"error": str(exc)})

    return build_pitch_chart
