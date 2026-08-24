from __future__ import annotations

import operator
from typing import Annotated, Any, Literal, TypedDict

from pydantic import BaseModel, Field, model_validator


class Metric(BaseModel):
    name: str
    value: float | int | str | None = None
    unit: str | None = None
    numerator: float | int | None = None
    denominator: float | int | None = None
    group: str | None = None

    @model_validator(mode="after")
    def validate_fraction(self) -> "Metric":
        if self.denominator is not None and self.denominator < 0:
            raise ValueError("denominator cannot be negative")
        if self.numerator is not None and self.numerator < 0:
            raise ValueError("numerator cannot be negative")
        return self


class AnalysisPacket(BaseModel):
    status: Literal["success", "cannot_answer", "error"]
    question_interpreted: str
    method: str
    filters: list[str] = Field(default_factory=list)
    metric_definitions: list[str] = Field(default_factory=list)
    metrics: list[Metric] = Field(default_factory=list)
    sample_size: int | None = Field(default=None, ge=0)
    result_table: list[dict[str, Any]] | None = None
    chart_file: str | None = None
    coverage: str
    warnings: list[str] = Field(default_factory=list)
    executed_code: list[str] = Field(default_factory=list)
    execution_evidence: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class GateVerdict(BaseModel):
    verdict: Literal["pass", "revise", "cannot_answer"]
    reason: str
    missing_requirements: list[str] = Field(default_factory=list)
    next_instruction: str = ""


class DatasetProfile(BaseModel):
    dataset_id: str
    file_name: str
    rows: int
    columns: int
    column_names: list[str]
    dtypes: dict[str, str]
    missing_values: dict[str, int]
    categorical_values: dict[str, list[str]]
    pitchers: int | None = None
    batters: int | None = None
    date_coverage: str | None = None
    ordering_strategy: str
    structural_key_strategy: str
    warnings: list[str] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)


class AnalysisState(TypedDict, total=False):
    thread_id: str
    dataset_id: str
    dataset_profile: dict[str, Any]
    messages: Annotated[list[dict[str, str]], operator.add]
    question: str
    prior_analysis_context: str
    gate_feedback: str
    analysis_attempt: int
    analysis_packet: dict[str, Any]
    deterministic_errors: list[str]
    gate_verdict: dict[str, Any]
    final_answer: dict[str, Any]


def deterministic_checks(packet: AnalysisPacket, question: str = "") -> list[str]:
    errors: list[str] = []
    if packet.status != "success":
        errors.append(f"analysis status is {packet.status}")
        return errors
    if not packet.executed_code or not packet.execution_evidence:
        errors.append("successful analysis requires executed code and execution evidence")
    if not packet.metrics and not packet.result_table:
        errors.append("successful analysis has no result")
    for metric in packet.metrics:
        if metric.denominator == 0:
            errors.append(f"{metric.name}: denominator is zero")
        if (
            metric.numerator is not None
            and metric.denominator is not None
            and metric.numerator > metric.denominator
        ):
            errors.append(f"{metric.name}: numerator exceeds denominator")
        if (
            metric.unit in {"percent", "%"}
            and isinstance(metric.value, (int, float))
            and metric.numerator is not None
            and metric.denominator
        ):
            expected = 100 * metric.numerator / metric.denominator
            if abs(float(metric.value) - expected) > 0.11:
                errors.append(f"{metric.name}: percentage disagrees with fraction")
    return errors
