"""Event-based scenario transformations for daily weather observations."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ClimateEvent:
    start_date: str
    end_date: str
    rainfall_change_pct: float = 0
    temperature_change_c: float = 0

    def applies(self, day: str) -> bool:
        return self.start_date <= day <= self.end_date


def apply_climate_events(rows: list[dict], events: list[ClimateEvent]) -> list[dict]:
    result = []
    for row in rows:
        updated = dict(row)
        event = next((e for e in events if e.applies(str(row.get("date", "")))), None)
        if event:
            if updated.get("rainfall_mm") is not None:
                updated["rainfall_mm"] = max(0.0, updated["rainfall_mm"] * (1 + event.rainfall_change_pct / 100))
            for key in ("temp_mean_c", "temp_max_c", "temp_min_c"):
                if updated.get(key) is not None:
                    updated[key] += event.temperature_change_c
        result.append(updated)
    return result
