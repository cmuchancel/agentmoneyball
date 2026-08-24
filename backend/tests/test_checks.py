from scouting.schemas import AnalysisPacket, Metric, deterministic_checks


def packet(**changes):
    base = dict(status="success", question_interpreted="q", method="pandas", filters=[],
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


def test_small_sample_needs_warning():
    assert any("small sample" in e for e in deterministic_checks(packet(sample_size=4)))

