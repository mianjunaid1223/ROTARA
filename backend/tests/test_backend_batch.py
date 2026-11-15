from datetime import date

import pytest

from app.algorithms.climate_events import ClimateEvent, apply_climate_events
from app.algorithms.irrigation import gross_irrigation_requirement, net_irrigation_requirement
from app.algorithms.market import groundwater_pressure, groundwater_status, market_demand_score
from app.services.coordinates import polygon_from_coordinates
from app.services.crops.catalog import load_crop_catalog, crop_calendar
from app.main import app
from fastapi.testclient import TestClient


def test_coordinate_polygon_is_closed_and_rejects_bad_input():
    polygon = polygon_from_coordinates([(73.0, 31.0), (73.01, 31.0), (73.01, 31.01)])
    assert polygon["coordinates"][0][0] == polygon["coordinates"][0][-1]
    with pytest.raises(ValueError):
        polygon_from_coordinates([(73.0, 31.0), (73.0, 31.0), (73.0, 31.0)])


def test_catalog_is_versioned_and_preserves_all_crops():
    catalog = load_crop_catalog()
    assert len(catalog) == 12
    assert catalog["wheat"].water_need_mm > 0


def test_calendar_is_date_based():
    result = crop_calendar("wheat", date(2026, 11, 15))
    assert result["planting_open"] is True
    assert result["planting_window_start"].year == 2026


def test_event_changes_only_rows_inside_event_window():
    rows = [{"date": "2026-07-01", "rainfall_mm": 10.0, "temp_max_c": 30.0},
            {"date": "2026-08-01", "rainfall_mm": 10.0, "temp_max_c": 30.0}]
    changed = apply_climate_events(rows, [ClimateEvent("2026-07-01", "2026-07-31", -50, 2)])
    assert changed[0]["rainfall_mm"] == 5
    assert changed[0]["temp_max_c"] == 32
    assert changed[1] == rows[1]


def test_irrigation_market_and_groundwater_math():
    net = net_irrigation_requirement(400, 100, 50)
    assert net == 250
    assert gross_irrigation_requirement(net, 0.5) == 500
    assert market_demand_score("very_high") > market_demand_score("moderate")
    assert groundwater_status(groundwater_pressure(300, 100)) == "high"


def test_irrigation_plan_and_history_endpoints():
    client = TestClient(app)
    plan = client.post(
        "/api/irrigation/plan",
        json={"field_id": "f1", "crop_id": "wheat", "et0_mm": 5, "crop_coefficient_kc": 1.1},
    )
    assert plan.status_code == 200
    assert plan.json()["recommended_depth_mm"] >= 0
    logged = client.post(
        "/api/irrigation/log",
        json={"field_id": "f1", "date": "2026-11-15", "depth_mm": 20},
    )
    assert logged.status_code == 200
    assert client.get("/api/irrigation/history?field_id=f1").json()[0]["depth_mm"] == 20
