import pandas as pd
import pytest

from scouting.data import DataValidationError, load_and_prepare


def test_structural_keys_do_not_change_source_columns(tmp_path):
    source = pd.DataFrame({"PitchNo": [1, 2, 1], "PitchofPA": [1, 2, 1], "Balls": [0, 0, 0],
                           "Strikes": [0, 1, 0], "TaggedPitchType": ["Fastball"] * 3,
                           "PitchCall": ["CalledStrike"] * 3})
    path = tmp_path / "pitches.csv"
    source.to_csv(path, index=False)
    prepared, profile = load_and_prepare(path)
    assert list(prepared.columns[:1]) == ["_source_row_id"]
    assert prepared.loc[2, "_session_id"] != prepared.loc[1, "_session_id"]
    pd.testing.assert_frame_equal(prepared[source.columns], source)
    assert profile.rows == 3


def test_rejects_non_pitch_csv(tmp_path):
    path = tmp_path / "bad.csv"
    pd.DataFrame({"a": [1], "b": [2]}).to_csv(path, index=False)
    with pytest.raises(DataValidationError):
        load_and_prepare(path)

