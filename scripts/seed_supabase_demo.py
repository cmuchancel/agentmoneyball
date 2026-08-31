from __future__ import annotations

import tempfile
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.scouting.data import combine_csv_files, load_and_prepare, save_prepared
from backend.scouting.supabase_store import SupabaseStore


def main() -> None:
    load_dotenv(ROOT / ".env")
    store = SupabaseStore.from_env()
    if not store:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.")
    sources = sorted((ROOT / "data" / "trackman_v3_games").glob("*.csv"))
    if not sources:
        raise SystemExit("The bundled TrackMan demo files are missing.")
    with tempfile.TemporaryDirectory(prefix="pitchquery-seed-") as temp_dir:
        combined = combine_csv_files(sources, Path(temp_dir) / "combined.csv")
        frame, profile = load_and_prepare(combined, demo_aliases=True)
        profile.file_name = "21 public TrackMan V3 scrimmage files"
        prepared = Path(temp_dir) / "pitches.csv"
        save_prepared(frame, prepared)
        store.upsert_demo_dataset(profile, prepared.read_bytes())
    print(f"Seeded demo dataset {profile.dataset_id} with {profile.rows:,} pitches.")


if __name__ == "__main__":
    main()
