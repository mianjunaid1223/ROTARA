from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import Polygon

from app.algorithms.indicators import compute_climate_indicators, compute_water_indicators
from app.algorithms.scenario import multiply_rainfall_anomaly
from app.cache.store import ResponseCache
from app.main import app
from app.models.schemas import (
    ClimateIndicators,
    ClimateScenarioInput,
    ClimateSimulationRequest,
    DailyWeatherPoint,
    DataSourceStatus,
    EnvironmentalAnalysisResponse,
    FarmerPriorities,
    FieldProfile,
    SoilHealthRequest,
    SoilLabInput,
    TerrainIndicators,
    VegetationIndicators,
    WaterIndicators,
)
from app.services.analysis.climate_sim import run_climate_simulation
from app.services.analysis.soil_health import evaluate_soil_health
from app.services.crops.punjab_data import PUNJAB_CROPS
from app.services.crops.rotation_engine import generate_rotation_recommendations
from app.services.geo import analyze_field_geometry
from app.services.nasa.planetary_computer import (
    _read_dem_terrain,
    _read_landsat_scene_stats,
    _read_s2_scene_stats,
    fetch_sentinel2_and_landsat,
    fetch_terrain_dem,
)
from app.services.nasa.power import get_power_observations_and_baseline, parse_power_series

client = TestClient(app)

SHEIKHUPURA_POLY = {
    "type": "Polygon",
    "coordinates": [
        [
            [73.9750, 31.7100],
            [73.9780, 31.7100],
            [73.9780, 31.7125],
            [73.9750, 31.7125],
            [73.9750, 31.7100],
        ]
    ],
}

MULTAN_POLY = {
    "type": "Polygon",
    "coordinates": [
        [
            [71.4800, 30.1800],
            [71.4830, 30.1800],
            [71.4830, 30.1825],
            [71.4800, 30.1825],
            [71.4800, 30.1800],
        ]
    ],
}


def test_geometry_area_and_punjab_zones() -> None:
    res_rice = analyze_field_geometry(SHEIKHUPURA_POLY)
    assert res_rice.in_punjab is True
    assert res_rice.agro_zone_id == "rice_wheat"
    assert 15.0 < res_rice.area_acres < 25.0
    assert 6.0 < res_rice.area_hectares < 10.0

    res_cotton = analyze_field_geometry(MULTAN_POLY)
    assert res_cotton.in_punjab is True
    assert res_cotton.agro_zone_id == "cotton_wheat"


def test_power_parser_filters_sentinels_and_computes_et0() -> None:
    sample_raw = {
        "properties": {
            "parameter": {
                "PRECTOTCORR": {"20261101": 0.0, "20261102": -999.0},
                "T2M": {"20261101": 21.5, "20261102": -999.0},
                "T2M_MAX": {"20261101": 28.0, "20261102": -999.0},
                "T2M_MIN": {"20261101": 14.0, "20261102": -999.0},
                "ALLSKY_SFC_SW_DWN": {"20261101": 15.5, "20261102": -999.0},
                "RH2M": {"20261101": 55.0, "20261102": -999.0},
                "WS2M": {"20261101": 1.8, "20261102": -999.0},
            }
        }
    }
    series = parse_power_series(sample_raw)
    assert len(series) == 1
    assert series[0].date == "2026-11-01"
    assert series[0].et0_mm is not None and 1.0 < series[0].et0_mm < 8.0


def test_rotation_engine_strategies_and_priority_sensitivity() -> None:
    field = FieldProfile(
        id="test-1",
        name="Sheikhupura Plot",
        geometry=SHEIKHUPURA_POLY,
        current_crop="rice",
        previous_crop="wheat",
        water_availability="limited",
    )
    rot_water = generate_rotation_recommendations(
        field=field,
        priorities=FarmerPriorities(water_conservation=5, soil_improvement=1, market_suitability=1, climate_resilience=4),
        ref_date_str="2026-11-14",
    )
    assert {s.strategy_id for s in rot_water.strategies} == {"A", "B", "C"}
    assert rot_water.current_punjab_season == "Rabi"

    rot_soil = generate_rotation_recommendations(
        field=field,
        priorities=FarmerPriorities(water_conservation=1, soil_improvement=5, market_suitability=1, climate_resilience=1),
        ref_date_str="2026-11-14",
    )
    score_b_water = next(s.overall_score for s in rot_water.strategies if s.strategy_id == "B")
    score_b_soil = next(s.overall_score for s in rot_soil.strategies if s.strategy_id == "B")
    score_c_soil = next(s.overall_score for s in rot_soil.strategies if s.strategy_id == "C")
    assert score_b_water != score_b_soil
    assert score_c_soil > score_b_soil


def test_soil_health_separates_missing_lab_results() -> None:
    field_no_lab = FieldProfile(
        id="soil-1",
        name="No Lab Field",
        geometry=SHEIKHUPURA_POLY,
        current_crop="wheat",
        previous_crop="wheat",
    )
    res_no_lab = evaluate_soil_health(field_no_lab)
    assert res_no_lab.measured_lab_present is False
    assert len(res_no_lab.cannot_conclude_without_lab) >= 3

    field_with_lab = FieldProfile(
        id="soil-2",
        name="Lab Field",
        geometry=SHEIKHUPURA_POLY,
        current_crop="wheat",
        previous_crop="mung_bean",
        soil_lab=SoilLabInput(ph=7.6, organic_matter_pct=0.55, ec_ds_m=1.4),
    )
    res_lab = evaluate_soil_health(field_with_lab)
    assert res_lab.measured_lab_present is True
    assert any(d.source_type == "measured_lab" for d in res_lab.dimensions)


def test_climate_simulator_marks_hypothetical_and_updates_scores() -> None:
    field = FieldProfile(
        id="sim-1",
        name="Multan Plot",
        geometry=MULTAN_POLY,
        current_crop="cotton",
        water_availability="moderate",
    )
    sim = run_climate_simulation(
        ClimateSimulationRequest(
            field=field,
            scenario=ClimateScenarioInput(rainfall_change_pct=-25, temp_increase_c=2.5, water_availability_override="scarce"),
            reference_date="2026-11-14",
        )
    )
    assert sim.is_hypothetical is True
    assert len(sim.strategy_deltas) == 3
    assert any(d.score_delta != 0 for d in sim.strategy_deltas)


def test_api_health_and_calendar_endpoints() -> None:
    h = client.get("/health")
    assert h.status_code == 200
    assert h.json()["status"] == "ok"

    cal = client.get("/api/crops/calendar?ref_date=2026-11-14")
    assert cal.status_code == 200
    body = cal.json()
    assert body["current_season"] == "Rabi"
    assert len(body["crops"]) >= 10

    bad_cal = client.get("/api/crops/calendar?ref_date=not-a-date")
    assert bad_cal.status_code == 400


def _make_sample_analysis(field_id: str, **water_overrides: object) -> EnvironmentalAnalysisResponse:
    geom_summary = analyze_field_geometry(SHEIKHUPURA_POLY)
    water_kwargs: dict[str, object] = {
        "rainfall_30d_mm": 12.0,
        "rainfall_90d_mm": 40.0,
        "rainfall_30d_baseline_mm": 15.0,
        "rainfall_anomaly_pct": -20.0,
        "dry_spell_max_days": 14,
        "et0_30d_mm": 90.0,
        "water_balance_30d_mm": -78.0,
        "moisture_proxy_status": "dry",
        "farmer_summary": "Dry",
        "agronomist_summary": "Dry",
    }
    water_kwargs.update(water_overrides)
    return EnvironmentalAnalysisResponse(
        field_id=field_id,
        analyzed_at="2026-11-14T00:00:00Z",
        geometry_summary=geom_summary,
        data_sources=[],
        water=WaterIndicators(**water_kwargs),  # type: ignore[arg-type]
        climate=ClimateIndicators(
            temp_mean_30d_c=24.0,
            temp_max_30d_c=31.0,
            heat_stress_days_90d=5,
            frost_risk_days_90d=0,
            farmer_summary="Normal",
            agronomist_summary="Normal",
        ),
        vegetation=VegetationIndicators(
            vegetation_status="moderate",
            farmer_summary="Moderate",
            agronomist_summary="Moderate",
        ),
        terrain=TerrainIndicators(
            elevation_m=210.0,
            slope_mean_pct=0.8,
            slope_max_pct=1.4,
            runoff_susceptibility="low",
            erosion_risk="low",
            farmer_summary="Flat",
            agronomist_summary="Flat",
        ),
        weather_series=[],
        ndvi_series=[],
        limitations=[],
    )


def test_sqlite_cache_closes_connections(tmp_path: Path) -> None:
    db_file = tmp_path / "cache.sqlite3"
    cache = ResponseCache(db_path=db_file, ttl_hours=1)
    cache.set("src", {"a": 1}, {"ok": True})
    assert cache.get("src", {"a": 1}) == {"ok": True}
    deleted = cache.clear()
    assert deleted == 1
    assert cache.get("src", {"a": 1}) is None
    # On Windows, an unclosed connection prevents unlinking the SQLite file
    db_file.unlink()
    assert not db_file.exists()


def test_mismatched_analysis_field_id_rejected() -> None:
    field = FieldProfile(
        id="field-a",
        name="Field A",
        geometry=SHEIKHUPURA_POLY,
        current_crop="wheat",
    )
    wrong_analysis = _make_sample_analysis("field-other")

    with pytest.raises(ValueError):
        evaluate_soil_health(field, analysis=wrong_analysis)
    with pytest.raises(ValueError):
        generate_rotation_recommendations(field, FarmerPriorities(), analysis=wrong_analysis)

    bad_payload = {
        "field": field.model_dump(),
        "analysis": wrong_analysis.model_dump(),
    }
    assert client.post("/api/soil/health", json=bad_payload).status_code == 422
    assert client.post("/api/rotations/recommend", json=bad_payload).status_code == 422
    sim_payload = {
        **bad_payload,
        "scenario": {"rainfall_change_pct": -10, "temp_increase_c": 1.0},
    }
    assert client.post("/api/climate/simulate", json=sim_payload).status_code == 422


def test_climate_simulator_without_override_and_empty_series() -> None:
    field = FieldProfile(
        id="sim-no-override",
        name="Rice-Wheat Field",
        geometry=SHEIKHUPURA_POLY,
        current_crop="rice",
        water_availability="moderate",
    )
    # 1. Empty weather_series in analysis with multiplicative anomaly (-20% existing + -25% scenario => -40%)
    empty_series_analysis = _make_sample_analysis(
        field.id,
        moisture_proxy_status="unknown",
        rainfall_anomaly_pct=-20.0,
    )
    sim = run_climate_simulation(
        ClimateSimulationRequest(
            field=field,
            scenario=ClimateScenarioInput(
                rainfall_change_pct=-25,
                temp_increase_c=2.5,
                water_availability_override=None,
            ),
            reference_date="2026-11-14",
            analysis=empty_series_analysis,
        )
    )
    assert any(d.score_delta != 0 for d in sim.strategy_deltas)
    assert any(c["suitability_change"] != 0 for c in sim.crop_suitability_shifts)

    # Check multiplicative anomaly math directly:
    # Existing -20% (0.8) * scenario -25% (0.75) = 0.60 => -40.0%, NOT -45.0%
    assert multiply_rainfall_anomaly(-20.0, 0.75) == -40.0

    # 2. analysis=None with only rainfall & temp shifts (no water override)
    sim_none = run_climate_simulation(
        ClimateSimulationRequest(
            field=field,
            scenario=ClimateScenarioInput(
                rainfall_change_pct=-25,
                temp_increase_c=2.0,
                water_availability_override=None,
            ),
            reference_date="2026-11-14",
            analysis=None,
        )
    )
    assert any(d.score_delta != 0 for d in sim_none.strategy_deltas)


def test_partial_power_series_preserves_none_and_formats_safely() -> None:
    rain_only = [
        DailyWeatherPoint(date="2026-11-01", rainfall_mm=5.0, et0_mm=None),
        DailyWeatherPoint(date="2026-11-02", rainfall_mm=3.5, et0_mm=None),
    ]
    water = compute_water_indicators(rain_only, [])
    assert water.rainfall_30d_mm == 8.5
    assert water.rainfall_90d_mm == 8.5
    assert water.et0_30d_mm is None
    assert water.water_balance_30d_mm is None
    assert water.moisture_proxy_status == "unknown"

    climate = compute_climate_indicators(rain_only, [])
    assert climate.temp_mean_30d_c is None
    assert climate.temp_max_30d_c is None
    assert "unavailable" in climate.farmer_summary.lower()

    # Ensure rotation engine supporting_observations handles non-null rain with null balance
    field = FieldProfile(id="partial-1", name="P1", geometry=SHEIKHUPURA_POLY, current_crop="wheat")
    partial_analysis = _make_sample_analysis(
        "partial-1",
        rainfall_30d_mm=8.5,
        water_balance_30d_mm=None,
        et0_30d_mm=None,
        moisture_proxy_status="unknown",
    )
    rot = generate_rotation_recommendations(field, FarmerPriorities(), "2026-11-14", analysis=partial_analysis)
    assert any("8" in obs or "9" in obs for obs in rot.strategies[0].supporting_observations)


def test_soil_health_partial_npk_keeps_missing_nutrients() -> None:
    field = FieldProfile(
        id="npk-partial",
        name="Partial Lab",
        geometry=SHEIKHUPURA_POLY,
        current_crop="wheat",
        soil_lab=SoilLabInput(nitrogen_ppm=40.0, phosphorus_ppm=None, potassium_ppm=None),
    )
    res = evaluate_soil_health(field)
    joined = " ".join(res.cannot_conclude_without_lab)
    assert "Phosphorus (P)" in joined
    assert "Potassium (K)" in joined


def test_canonical_families_date_alignment_sequences_and_zero_priorities() -> None:
    assert PUNJAB_CROPS["wheat"].crop_family == "Poaceae"
    assert PUNJAB_CROPS["sorghum_millet"].crop_family == "Poaceae"
    assert PUNJAB_CROPS["chickpea"].crop_family == "Fabaceae"
    assert PUNJAB_CROPS["berseem"].crop_family == "Fabaceae"
    assert PUNJAB_CROPS["wheat"].crop_group == "Cereal"

    # Year-aware date alignment in late December picks earliest 2027 window instead of passed Rabi
    cotton_field = FieldProfile(
        id="cw-1",
        name="Multan Cotton",
        geometry=MULTAN_POLY,
        current_crop="cotton",
        water_availability="moderate",
    )
    rot_dec = generate_rotation_recommendations(cotton_field, FarmerPriorities(), ref_date_str="2026-12-20")
    for strat in rot_dec.strategies:
        cids = [s.crop_id for s in strat.steps]
        for i in range(len(cids)):
            assert not (cids[i] == "mung_bean" and cids[(i + 1) % len(cids)] == "cotton")

    # Zero-sum constructed FarmerPriorities safely avoided division by zero
    zero_pri = FarmerPriorities.model_construct(
        water_conservation=0,
        soil_improvement=0,
        market_suitability=0,
        climate_resilience=0,
    )
    rot_zero = generate_rotation_recommendations(cotton_field, zero_pri, ref_date_str="2026-11-14")
    assert len(rot_zero.strategies) == 3


def test_geo_orientation_holes_and_mixed_multipolygon() -> None:
    # Polygon with hole having SAME CCW winding as exterior ring
    outer_ccw = [[73.0, 31.0], [73.02, 31.0], [73.02, 31.02], [73.0, 31.02], [73.0, 31.0]]
    hole_ccw = [[73.005, 31.005], [73.015, 31.005], [73.015, 31.015], [73.005, 31.015], [73.005, 31.005]]
    poly_no_hole = {"type": "Polygon", "coordinates": [outer_ccw]}
    poly_with_hole = {"type": "Polygon", "coordinates": [outer_ccw, hole_ccw]}
    res_outer = analyze_field_geometry(poly_no_hole)
    res_holed = analyze_field_geometry(poly_with_hole)
    assert res_holed.area_hectares < res_outer.area_hectares

    # MultiPolygon with mixed windings (one CCW, one CW) must add, not cancel
    part1_ccw = outer_ccw
    part2_cw = [[73.03, 31.0], [73.03, 31.02], [73.05, 31.02], [73.05, 31.0], [73.03, 31.0]]
    mpoly = {"type": "MultiPolygon", "coordinates": [[part1_ccw], [part2_cw]]}
    res_mp = analyze_field_geometry(mpoly)
    assert res_mp.area_hectares > res_outer.area_hectares * 1.9


def test_planetary_computer_masking_scl_failure_and_dem_fallback(tmp_path: Path) -> None:
    # Small polygon in UTM Zone 43N / EPSG:4326 covering center pixel (indices 2..4 in a 6x6 0.001-deg grid)
    origin_lon, origin_lat = 73.970, 31.716
    transform = from_origin(origin_lon, origin_lat, 0.001, 0.001)
    poly = Polygon([
        (73.972, 31.714),
        (73.974, 31.714),
        (73.974, 31.712),
        (73.972, 31.712),
        (73.972, 31.714),
    ])

    def write_tif(name: str, arr: np.ndarray) -> str:
        path = tmp_path / name
        with rasterio.open(
            path,
            "w",
            driver="GTiff",
            height=arr.shape[0],
            width=arr.shape[1],
            count=1,
            dtype=arr.dtype,
            crs="EPSG:4326",
            transform=transform,
        ) as dst:
            dst.write(arr, 1)
        return str(path)

    # Inside polygon: red=1000, nir=3000 -> NDVI=0.5. Outside polygon: red=3000, nir=1000 -> NDVI=-0.5
    red_arr = np.full((6, 6), 3000, dtype=np.float32)
    nir_arr = np.full((6, 6), 1000, dtype=np.float32)
    red_arr[2:4, 2:4] = 1000
    nir_arr[2:4, 2:4] = 3000
    scl_arr = np.full((6, 6), 4, dtype=np.float32)

    red_tif = write_tif("red.tif", red_arr)
    nir_tif = write_tif("nir.tif", nir_arr)
    scl_tif = write_tif("scl.tif", scl_arr)

    ndvi, _, share = _read_s2_scene_stats(poly, red_tif, nir_tif, None, scl_tif)
    assert ndvi == pytest.approx(0.5, abs=0.01)
    assert share == 1.0

    # SCL failure must reject scene rather than using unmasked pixels
    bad_ndvi, bad_ndwi, bad_share = _read_s2_scene_stats(poly, red_tif, nir_tif, None, str(tmp_path / "missing_scl.tif"))
    assert bad_ndvi is None and bad_ndwi is None and bad_share == 0.0

    # Landsat masked to polygon
    ls_red = np.full((6, 6), 15000, dtype=np.float32)
    ls_nir = np.full((6, 6), 10000, dtype=np.float32)
    ls_red[2:4, 2:4] = 10000
    ls_nir[2:4, 2:4] = 20000
    ls_ndvi = _read_landsat_scene_stats(poly, write_tif("lred.tif", ls_red), write_tif("lnir.tif", ls_nir))
    assert ls_ndvi is not None and ls_ndvi > 0.5

    # DEM masked to polygon (outside pixels have huge outlier elevation 5000m, inside is flat 200m)
    dem_arr = np.full((6, 6), 5000.0, dtype=np.float32)
    dem_arr[2:4, 2:4] = 200.0
    elev_m, _, _ = _read_dem_terrain(poly, write_tif("dem.tif", dem_arr))
    assert elev_m == pytest.approx(200.0, abs=1.0)


def test_dem_fallback_and_power_partial_baseline() -> None:
    poly = Polygon([
        (73.975, 31.710),
        (73.978, 31.710),
        (73.978, 31.7125),
        (73.975, 31.7125),
        (73.975, 31.710),
    ])

    class _FakeResp:
        def __init__(self, payload: dict, fail: bool = False) -> None:
            self._payload = payload
            self._fail = fail

        def raise_for_status(self) -> None:
            if self._fail:
                raise RuntimeError("STAC error")

        def json(self) -> dict:
            return self._payload

    async def _run_dem() -> tuple[TerrainIndicators, DataSourceStatus]:
        async def fake_post(url: str, json: dict) -> _FakeResp:
            coll = json["collections"][0]
            if coll == "nasadem":
                return _FakeResp({}, fail=True)
            return _FakeResp({"features": [{"assets": {"data": {"href": "https://example.com/dem.tif"}}}]})

        with (
            patch("httpx.AsyncClient.post", side_effect=fake_post),
            patch("app.services.nasa.planetary_computer._get_sas_token", new=AsyncMock(return_value="sig=1")),
            patch("app.services.nasa.planetary_computer._read_dem_terrain", return_value=(195.0, 0.9, 1.5)),
            patch("app.services.nasa.planetary_computer.cache_store.get", return_value=None),
            patch("app.services.nasa.planetary_computer.cache_store.set", return_value=None),
        ):
            return await fetch_terrain_dem(poly)

    terrain, status = asyncio.run(_run_dem())
    assert status.status == "available"
    assert "Copernicus" in status.name
    assert terrain.elevation_m == 195.0

    # Single NASA POWER call spans recent + 5-year baseline; missing baseline years report partial status
    from datetime import date

    raw_single = {
        "properties": {
            "parameter": {
                "PRECTOTCORR": {"20261101": 2.0, "20251015": 1.0},
                "T2M": {"20261101": 22.0, "20251015": 23.0},
                "T2M_MAX": {"20261101": 29.0, "20251015": 30.0},
                "T2M_MIN": {"20261101": 15.0, "20251015": 16.0},
                "ALLSKY_SFC_SW_DWN": {"20261101": 16.0, "20251015": 15.0},
                "RH2M": {"20261101": 55.0, "20251015": 50.0},
                "WS2M": {"20261101": 1.5, "20251015": 1.6},
            }
        }
    }

    call_count = 0

    async def fake_power_window(*args: object, **kwargs: object) -> dict:
        nonlocal call_count
        call_count += 1
        return raw_single

    async def _run_power() -> tuple[list[DailyWeatherPoint], list[DailyWeatherPoint], DataSourceStatus]:
        with patch("app.services.nasa.power.fetch_nasa_power_window", side_effect=fake_power_window):
            return await get_power_observations_and_baseline(31.71, 73.97, ref_date=date(2026, 11, 14))

    recent_s, base_s, p_status = asyncio.run(_run_power())
    assert call_count == 1
    assert len(recent_s) == 1
    assert len(base_s) == 1
    assert p_status.status == "partial"


def test_continuous_presets_and_optical_scene_selection() -> None:
    from datetime import date

    field = FieldProfile(
        id="preset-field",
        name="Canal Wheat Field",
        geometry=SHEIKHUPURA_POLY,
        current_crop="wheat",
        water_availability="moderate",
    )
    analysis = _make_sample_analysis(field.id)
    baseline_rot = generate_rotation_recommendations(field, FarmerPriorities(), "2026-11-14", analysis=analysis)
    best_id = baseline_rot.strategies[0].strategy_id

    for label, scenario in [
        ("less_rain", ClimateScenarioInput(rainfall_change_pct=-30, temp_increase_c=0.0)),
        ("more_heat", ClimateScenarioInput(rainfall_change_pct=0, temp_increase_c=2.0)),
        ("less_water", ClimateScenarioInput(rainfall_change_pct=0, temp_increase_c=0.0, water_availability_override="scarce")),
    ]:
        sim = run_climate_simulation(
            ClimateSimulationRequest(
                field=field,
                scenario=scenario,
                reference_date="2026-11-14",
                analysis=analysis,
            )
        )
        best_delta = next(d for d in sim.strategy_deltas if d.strategy_id == best_id)
        assert abs(best_delta.score_delta) >= 1.0, f"{label} changed best score by only {best_delta.score_delta}"
        if label in ("less_rain", "less_water"):
            rice_shift = next(c for c in sim.crop_suitability_shifts if c["crop_id"] == "rice")
            assert rice_shift["suitability_change"] <= 0.0

    # Sentinel-2 picks <= 3 lowest-cloud scenes and skips Landsat when >= 2 valid S2 scenes return
    poly = Polygon([(73.975, 31.710), (73.978, 31.710), (73.978, 31.7125), (73.975, 31.7125), (73.975, 31.710)])
    fake_s2_features = [
        {
            "properties": {"datetime": f"2026-10-0{i}T05:30:00Z", "eo:cloud_cover": cloud},
            "assets": {"B04": {"href": f"https://ex/{i}r.tif"}, "B08": {"href": f"https://ex/{i}n.tif"}},
        }
        for i, cloud in enumerate([12.0, 4.0, 9.0, 2.0, 14.0], start=1)
    ]

    landsat_called = False
    read_urls: list[str] = []

    async def fake_search(client: object, coll: str, *args: object, **kwargs: object) -> list[dict]:
        nonlocal landsat_called
        if coll == "landsat-c2-l2":
            landsat_called = True
            return []
        return fake_s2_features

    def fake_s2_stats(g: object, red_url: str, *args: object) -> tuple[float, float, float]:
        read_urls.append(red_url)
        return 0.55, 0.12, 1.0

    async def _run_optical() -> tuple[list, DataSourceStatus, DataSourceStatus]:
        with (
            patch("app.services.nasa.planetary_computer._search_stac_scenes", side_effect=fake_search),
            patch("app.services.nasa.planetary_computer._get_sas_token", new=AsyncMock(return_value="sig=1")),
            patch("app.services.nasa.planetary_computer._read_s2_scene_stats", side_effect=fake_s2_stats),
            patch("app.services.nasa.planetary_computer.cache_store.get", return_value=None),
            patch("app.services.nasa.planetary_computer.cache_store.set", return_value=None),
        ):
            return await fetch_sentinel2_and_landsat(poly, ref_date=date(2026, 11, 14))

    pts, s2_st, l8_st = asyncio.run(_run_optical())
    assert len(read_urls) == 3
    assert len(pts) == 3
    assert s2_st.status == "available"
    assert landsat_called is False
    assert "Skipped" in l8_st.limitations
