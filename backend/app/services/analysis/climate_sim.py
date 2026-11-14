from __future__ import annotations

from copy import deepcopy

from app.algorithms.et0 import DEFAULT_ELEVATION_M
from app.algorithms.rotation_score import score_crop_climate_fit, score_crop_water_demand
from app.algorithms.scenario import (
    HEAT_DAYS_PER_DEGREE_FALLBACK,
    apply_scenario_to_series,
    multiply_rainfall_anomaly,
    shift_moisture_status_without_series,
)
from app.models.schemas import (
    ClimateIndicators,
    ClimateSimulationRequest,
    ClimateSimulationResponse,
    EnvironmentalAnalysisResponse,
    StrategyDelta,
    TerrainIndicators,
    VegetationIndicators,
    WaterIndicators,
)
from app.services.crops.punjab_data import PUNJAB_CROPS
from app.services.crops.rotation_engine import generate_rotation_recommendations
from app.services.geo import analyze_field_geometry


def run_climate_simulation(req: ClimateSimulationRequest) -> ClimateSimulationResponse:
    if req.analysis is not None and req.analysis.field_id != req.field.id:
        raise ValueError(f"analysis.field_id ({req.analysis.field_id}) does not match field.id ({req.field.id}).")

    baseline_rot = generate_rotation_recommendations(
        field=req.field,
        priorities=req.priorities,
        ref_date_str=req.reference_date,
        analysis=req.analysis,
    )

    sim_field = deepcopy(req.field)
    if req.scenario.water_availability_override is not None:
        sim_field.water_availability = req.scenario.water_availability_override

    geom_summary = (
        req.analysis.geometry_summary if req.analysis is not None else analyze_field_geometry(req.field.geometry)
    )
    sim_analysis = (
        deepcopy(req.analysis)
        if req.analysis is not None
        else EnvironmentalAnalysisResponse(
            field_id=req.field.id,
            analyzed_at="",
            geometry_summary=geom_summary,
            data_sources=[],
            water=WaterIndicators(moisture_proxy_status="unknown", farmer_summary="", agronomist_summary=""),
            climate=ClimateIndicators(farmer_summary="", agronomist_summary=""),
            vegetation=VegetationIndicators(vegetation_status="unknown", farmer_summary="", agronomist_summary=""),
            terrain=TerrainIndicators(
                runoff_susceptibility="unknown", erosion_risk="unknown", farmer_summary="", agronomist_summary=""
            ),
            weather_series=[],
            ndvi_series=[],
            limitations=[],
        )
    )

    rain_factor = 1.0 + (req.scenario.rainfall_change_pct / 100.0)
    temp_shift = req.scenario.temp_increase_c
    elev_m = sim_analysis.terrain.elevation_m or DEFAULT_ELEVATION_M

    if sim_analysis.weather_series:
        shifted = apply_scenario_to_series(sim_analysis.weather_series, rain_factor, temp_shift, elev_m)
        if shifted["moisture_status"] is not None:
            sim_analysis.water.rainfall_30d_mm = shifted["rainfall_30d_mm"]  # type: ignore[assignment]
            sim_analysis.water.et0_30d_mm = shifted["et0_30d_mm"]  # type: ignore[assignment]
            sim_analysis.water.water_balance_30d_mm = shifted["water_balance_30d_mm"]  # type: ignore[assignment]
            sim_analysis.water.moisture_proxy_status = shifted["moisture_status"]  # type: ignore[assignment]
        else:
            sim_analysis.water.moisture_proxy_status = shift_moisture_status_without_series(
                sim_analysis.water.moisture_proxy_status,
                req.scenario.rainfall_change_pct,
                temp_shift,
            )  # type: ignore[assignment]

        if shifted["temp_mean_30d_c"] is not None:
            sim_analysis.climate.temp_mean_30d_c = shifted["temp_mean_30d_c"]  # type: ignore[assignment]
        if shifted["temp_max_30d_c"] is not None:
            sim_analysis.climate.temp_max_30d_c = shifted["temp_max_30d_c"]  # type: ignore[assignment]
        sim_analysis.climate.heat_stress_days_90d = int(shifted["heat_days"] or 0)
    else:
        sim_analysis.water.moisture_proxy_status = shift_moisture_status_without_series(
            sim_analysis.water.moisture_proxy_status,
            req.scenario.rainfall_change_pct,
            temp_shift,
        )  # type: ignore[assignment]
        if sim_analysis.water.water_balance_30d_mm is not None and sim_analysis.water.rainfall_30d_mm is not None:
            rain_delta = sim_analysis.water.rainfall_30d_mm * (rain_factor - 1.0)
            sim_analysis.water.rainfall_30d_mm = round(max(0.0, sim_analysis.water.rainfall_30d_mm + rain_delta), 1)
            sim_analysis.water.water_balance_30d_mm = round(sim_analysis.water.water_balance_30d_mm + rain_delta, 1)

        base_heat = sim_analysis.climate.heat_stress_days_90d
        if base_heat is not None:
            sim_analysis.climate.heat_stress_days_90d = max(
                0, round(base_heat + temp_shift * HEAT_DAYS_PER_DEGREE_FALLBACK)
            )
        elif temp_shift > 0:
            sim_analysis.climate.heat_stress_days_90d = max(0, round(temp_shift * HEAT_DAYS_PER_DEGREE_FALLBACK))
        elif temp_shift < 0:
            sim_analysis.climate.heat_stress_days_90d = 0

        if sim_analysis.climate.temp_max_30d_c is not None:
            sim_analysis.climate.temp_max_30d_c = round(sim_analysis.climate.temp_max_30d_c + temp_shift, 1)
        if sim_analysis.climate.temp_mean_30d_c is not None:
            sim_analysis.climate.temp_mean_30d_c = round(sim_analysis.climate.temp_mean_30d_c + temp_shift, 1)

    if sim_analysis.water.rainfall_anomaly_pct is not None or req.scenario.rainfall_change_pct != 0:
        sim_analysis.water.rainfall_anomaly_pct = multiply_rainfall_anomaly(
            sim_analysis.water.rainfall_anomaly_pct,
            rain_factor,
        )

    simulated_rot = generate_rotation_recommendations(
        field=sim_field,
        priorities=req.priorities,
        ref_date_str=req.reference_date,
        analysis=sim_analysis,
    )

    base_rank = {s.strategy_id: i + 1 for i, s in enumerate(baseline_rot.strategies)}
    sim_rank = {s.strategy_id: i + 1 for i, s in enumerate(simulated_rot.strategies)}
    base_by_id = {s.strategy_id: s for s in baseline_rot.strategies}

    deltas = [
        StrategyDelta(
            strategy_id=sim_s.strategy_id,
            title=sim_s.title,
            baseline_score=base_by_id[sim_s.strategy_id].overall_score,
            simulated_score=sim_s.overall_score,
            score_delta=round(sim_s.overall_score - base_by_id[sim_s.strategy_id].overall_score, 1),
            baseline_rank=base_rank[sim_s.strategy_id],
            simulated_rank=sim_rank[sim_s.strategy_id],
        )
        for sim_s in simulated_rot.strategies
    ]

    zone_id = geom_summary.agro_zone_id
    base_water = req.analysis.water.moisture_proxy_status if req.analysis else "unknown"
    sim_water = sim_analysis.water.moisture_proxy_status
    base_anom = req.analysis.water.rainfall_anomaly_pct if req.analysis else None
    sim_anom = sim_analysis.water.rainfall_anomaly_pct
    base_wb = req.analysis.water.water_balance_30d_mm if req.analysis else None
    sim_wb = sim_analysis.water.water_balance_30d_mm
    base_heat = req.analysis.climate.heat_stress_days_90d if req.analysis else None
    sim_heat = sim_analysis.climate.heat_stress_days_90d
    base_tmax = req.analysis.climate.temp_max_30d_c if req.analysis else None
    sim_tmax = sim_analysis.climate.temp_max_30d_c
    slope_pct = req.analysis.terrain.slope_mean_pct if req.analysis else None

    crop_shifts = []
    for cid in ["wheat", "rice", "cotton", "maize", "chickpea", "mung_bean", "sorghum_millet"]:
        crop = PUNJAB_CROPS[cid]
        base_avg = 0.5 * (
            score_crop_water_demand(crop, req.field.water_availability, base_water, base_anom, base_wb)
            + score_crop_climate_fit(crop, zone_id, base_heat, slope_pct, base_tmax)
        )
        sim_avg = 0.5 * (
            score_crop_water_demand(crop, sim_field.water_availability, sim_water, sim_anom, sim_wb)
            + score_crop_climate_fit(crop, zone_id, sim_heat, slope_pct, sim_tmax)
        )
        shift = round(sim_avg - base_avg, 1)
        crop_shifts.append(
            {
                "crop_id": crop.id,
                "crop_name": f"{crop.name} ({crop.local_name})",
                "season": crop.season,
                "suitability_change": shift,
                "direction": "improved" if shift > 1.0 else ("reduced" if shift < -1.0 else "stable"),
            }
        )

    top_sim = simulated_rot.strategies[0]
    takeaway = (
        f"Under {req.scenario.rainfall_change_pct:+d}% rain, {temp_shift:+.1f} C heat, "
        f"and '{sim_field.water_availability}' water: '{top_sim.title}' ranks #1 ({top_sim.overall_score:.1f})."
    )

    return ClimateSimulationResponse(
        field_id=req.field.id,
        is_hypothetical=True,
        scenario=req.scenario,
        baseline_summary={
            "water_availability": req.field.water_availability,
            "moisture_status": base_water,
            "rainfall_30d_mm": req.analysis.water.rainfall_30d_mm if req.analysis else None,
            "temp_mean_30d_c": req.analysis.climate.temp_mean_30d_c if req.analysis else None,
        },
        simulated_summary={
            "water_availability": sim_field.water_availability,
            "moisture_status": sim_water,
            "rainfall_30d_mm": sim_analysis.water.rainfall_30d_mm,
            "temp_mean_30d_c": sim_analysis.climate.temp_mean_30d_c,
        },
        strategy_deltas=deltas,
        simulated_strategies=simulated_rot.strategies,
        crop_suitability_shifts=crop_shifts,
        assumptions=[
            "Hypothetical test only: not an official weather forecast.",
            "Shifts observed NASA POWER weather and recomputes FAO-56 ET0 and heat days.",
            "Does not cover pests, canal closures, or mandi price swings.",
        ],
        farmer_takeaway=takeaway,
    )
