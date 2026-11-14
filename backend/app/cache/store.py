from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from pathlib import Path
from typing import Any

from app.config import settings


class ResponseCache:
    """Lightweight SQLite cache for NASA and satellite API responses."""

    def __init__(self, db_path: Path | None = None, ttl_hours: int | None = None) -> None:
        self.db_path = db_path or (settings.cache_dir / "rotara_cache.sqlite3")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.ttl_seconds = (ttl_hours if ttl_hours is not None else settings.cache_ttl_hours) * 3600
        self._init_db()

    def _init_db(self) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            with conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS api_cache (
                        cache_key TEXT PRIMARY KEY,
                        source TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        created_at REAL NOT NULL
                    )
                    """
                )
        finally:
            conn.close()

    @staticmethod
    def make_key(source: str, params: dict[str, Any]) -> str:
        canonical = json.dumps({"source": source, "params": params}, sort_keys=True)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def get(self, source: str, params: dict[str, Any], ttl_hours: float | None = None) -> Any | None:
        key = self.make_key(source, params)
        now = time.time()
        max_age = (ttl_hours * 3600.0) if ttl_hours is not None else self.ttl_seconds
        conn = sqlite3.connect(self.db_path)
        try:
            row = conn.execute(
                "SELECT payload, created_at FROM api_cache WHERE cache_key = ?",
                (key,),
            ).fetchone()
        finally:
            conn.close()
        if not row:
            return None
        payload_str, created_at = row
        if now - float(created_at) > max_age:
            return None
        return json.loads(payload_str)

    def set(self, source: str, params: dict[str, Any], value: Any) -> None:
        key = self.make_key(source, params)
        conn = sqlite3.connect(self.db_path)
        try:
            with conn:
                conn.execute(
                    """
                    INSERT INTO api_cache (cache_key, source, payload, created_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(cache_key) DO UPDATE SET
                        payload = excluded.payload,
                        created_at = excluded.created_at
                    """,
                    (key, source, json.dumps(value), time.time()),
                )
        finally:
            conn.close()

    def clear(self) -> int:
        conn = sqlite3.connect(self.db_path)
        try:
            with conn:
                cur = conn.execute("DELETE FROM api_cache")
                return cur.rowcount
        finally:
            conn.close()


cache_store = ResponseCache()
