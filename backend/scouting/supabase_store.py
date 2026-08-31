from __future__ import annotations

import base64
import gzip
import os
from dataclasses import dataclass
from datetime import date
from typing import Any

import httpx

from .schemas import DatasetProfile


@dataclass
class RemoteDataset:
    dataset_id: str
    profile: DatasetProfile
    prepared_csv: bytes
    openai_file_id: str | None = None


class SupabaseStore:
    """Minimal server-only Supabase REST client for persistent demo data and usage."""

    def __init__(self, url: str, service_role_key: str, client: httpx.Client | None = None):
        self.url = url.rstrip("/")
        self.service_role_key = service_role_key
        self.client = client or httpx.Client(timeout=45)

    @classmethod
    def from_env(cls) -> SupabaseStore | None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url and not key:
            return None
        if not url or not key:
            raise RuntimeError("Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        return cls(url, key)

    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
            **kwargs.pop("headers", {}),
        }
        response = self.client.request(method, f"{self.url}{path}", headers=headers, **kwargs)
        if response.is_error:
            detail = response.text[:300].replace(self.service_role_key, "<redacted>")
            raise RuntimeError(f"Supabase request failed ({response.status_code}): {detail}")
        return response

    def get_demo_dataset(self) -> RemoteDataset:
        response = self._request(
            "GET",
            "/rest/v1/pitchquery_datasets",
            params={
                "slug": "eq.demo",
                "select": "id,profile,csv_gzip_base64,openai_file_id",
                "limit": "1",
            },
        )
        rows = response.json()
        if not rows:
            raise RuntimeError("The Supabase demo dataset has not been seeded yet.")
        row = rows[0]
        try:
            prepared_csv = gzip.decompress(base64.b64decode(row["csv_gzip_base64"]))
        except Exception as exc:
            raise RuntimeError("The Supabase demo dataset is corrupt.") from exc
        return RemoteDataset(
            dataset_id=row["id"],
            profile=DatasetProfile.model_validate(row["profile"]),
            prepared_csv=prepared_csv,
            openai_file_id=row.get("openai_file_id"),
        )

    def upsert_demo_dataset(self, profile: DatasetProfile, prepared_csv: bytes) -> None:
        payload = {
            "id": profile.dataset_id,
            "slug": "demo",
            "profile": profile.model_dump(mode="json"),
            "csv_gzip_base64": base64.b64encode(gzip.compress(prepared_csv, compresslevel=9)).decode("ascii"),
        }
        self._request(
            "POST",
            "/rest/v1/pitchquery_datasets",
            params={"on_conflict": "slug"},
            headers={"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
            json=payload,
        )

    def set_openai_file_id(self, dataset_id: str, file_id: str) -> None:
        self._request(
            "PATCH",
            "/rest/v1/pitchquery_datasets",
            params={"id": f"eq.{dataset_id}"},
            headers={"Content-Type": "application/json"},
            json={"openai_file_id": file_id},
        )

    def usage_snapshot(self, usage_day: date, limit: int) -> dict[str, int | str]:
        response = self._request(
            "GET",
            "/rest/v1/pitchquery_daily_usage",
            params={"day": f"eq.{usage_day.isoformat()}", "select": "tokens", "limit": "1"},
        )
        rows = response.json()
        used = int(rows[0]["tokens"]) if rows else 0
        return {
            "date": usage_day.isoformat(),
            "tokens": used,
            "limit": limit,
            "remaining": max(0, limit - used),
        }

    def add_usage(self, usage_day: date, tokens: int) -> None:
        self._request(
            "POST",
            "/rest/v1/rpc/pitchquery_add_usage",
            headers={"Content-Type": "application/json"},
            json={"usage_day": usage_day.isoformat(), "token_count": tokens},
        )
