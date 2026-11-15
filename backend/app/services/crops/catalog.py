"""Versioned crop catalog loader.

The checked-in manifest deliberately contains only stable IDs.  Agronomic records
remain in ``punjab_data`` for backwards compatibility; the loader validates that
the manifest cannot silently drop a crop when the data source is upgraded.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml
from datetime import date
from pydantic import BaseModel, Field

from app.models.schemas import CropInfo
from app.services.crops.punjab_data import PUNJAB_CROPS


class CropCatalog(BaseModel):
    version: str = Field(min_length=1)
    crop_ids: list[str] = Field(min_length=1)


DEFAULT_CATALOG_PATH = Path(__file__).with_name("catalog.yaml")


def load_crop_catalog(path: str | Path | None = None) -> dict[str, CropInfo]:
    source = Path(path or DEFAULT_CATALOG_PATH)
    with source.open(encoding="utf-8") as handle:
        raw: Any = json.load(handle) if source.suffix.lower() == ".json" else yaml.safe_load(handle)
    catalog = CropCatalog.model_validate(raw)
    if set(catalog.crop_ids) != set(PUNJAB_CROPS):
        raise ValueError("crop catalog IDs do not match the supported Punjab crop set")
    return {crop_id: PUNJAB_CROPS[crop_id] for crop_id in catalog.crop_ids}


CATALOG_VERSION = "2026.1"


def crop_calendar(crop_id: str, reference_date: date) -> dict[str, Any]:
    crops = load_crop_catalog()
    if crop_id not in crops:
        raise ValueError(f"unknown crop_id '{crop_id}'")
    crop = crops[crop_id]
    year = reference_date.year
    planting = sorted(date(year, month, 1) for month in crop.planting_months)
    harvest = sorted(date(year, month, 1) for month in crop.harvest_months)
    # Windows that cross December are represented in the reference year.
    start, end = planting[0], planting[-1]
    harvest_start, harvest_end = harvest[0], harvest[-1]
    return {
        "crop_id": crop.id,
        "season": crop.season,
        "reference_date": reference_date,
        "planting_open": reference_date.month in crop.planting_months,
        "planting_window_start": start,
        "planting_window_end": end,
        "harvest_window_start": harvest_start,
        "harvest_window_end": harvest_end,
    }
