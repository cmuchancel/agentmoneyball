import pandas as pd
import pytest

from scouting.data import DataValidationError, combine_csv_files, load_and_prepare


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


def test_v3_game_and_plate_appearance_boundaries(tmp_path):
    source = pd.DataFrame({
        "PitchNo": [1, 2, 1, 2], "PitchofPA": [1, 2, 1, 1],
        "PAofInning": [1, 1, 1, 1], "Inning": [1, 1, 1, 1],
        "Top/Bottom": ["Top", "Top", "Bottom", "Bottom"],
        "Balls": [0] * 4, "Strikes": [0, 1, 0, 0],
        "TaggedPitchType": ["Fastball"] * 4, "PitchCall": ["StrikeCalled"] * 4,
    })
    path = tmp_path / "v3.csv"
    source.to_csv(path, index=False)
    prepared, profile = load_and_prepare(path)
    assert prepared.loc[1, "_session_id"] != prepared.loc[2, "_session_id"]
    assert prepared.loc[0, "_pa_id"] != prepared.loc[2, "_pa_id"]
    assert "PitchNo resets" in profile.structural_key_strategy


def test_folder_files_become_explicit_sessions(tmp_path):
    for game in ("one", "two"):
        pd.DataFrame({"PitchNo": [1], "PitchofPA": [1], "Balls": [0], "Strikes": [0],
                      "TaggedPitchType": ["Fastball"], "PitchCall": ["StrikeCalled"]}) \
            .to_csv(tmp_path / f"{game}.csv", index=False)
    combined = combine_csv_files([tmp_path / "one.csv", tmp_path / "two.csv"], tmp_path / "all.csv")
    prepared, profile = load_and_prepare(combined)
    assert prepared["_session_id"].nunique() == 2
    assert prepared["_source_file"].tolist() == ["one.csv", "two.csv"]
    assert profile.rows == 2
