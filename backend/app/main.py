from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.cache.store import cache_store
from app.config import settings
from app.models.schemas import (
    AreaResponse,
    ClimateSimulationRequest,
    ClimateSimulationResponse,
    CropInfo,
    EnvironmentalAnalysisResponse,
    FieldProfile,
    RotationRequest,
    RotationResponse,
    SoilHealthRequest,
    SoilHealthResponse,
    BackupPayload,
    IrrigationRequest,
    IrrigationResponse,
    CalendarWindow,
    GroundwaterRequest,
    GroundwaterResponse,
    MarketScoreRequest,
    MarketScoreResponse,
    QualityConfidence,
    IrrigationPlanRequest,
    IrrigationPlanResponse,
    IrrigationLog,
)
from app.services.analysis.climate_sim import run_climate_simulation
from app.services.analysis.environment import run_environmental_analysis
from app.services.analysis.soil_health import evaluate_soil_health
from app.services.crops.punjab_data import PUNJAB_CROPS, get_punjab_season_context
from app.services.crops.rotation_engine import generate_rotation_recommendations
from app.services.geo import analyze_field_geometry
from app.services.providers import SOURCES
from app.services.crops.catalog import crop_calendar
from app.algorithms.irrigation import gross_irrigation_requirement, net_irrigation_requirement
from app.algorithms.market import groundwater_pressure, groundwater_status, market_demand_score

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Earth-informed crop rotation intelligence API for Punjab, Pakistan.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_irrigation_logs: list[IrrigationLog] = []


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


@app.post("/api/fields/geometry", response_model=AreaResponse)
def compute_field_geometry(geometry: dict[str, Any]) -> AreaResponse:
    try:
        return analyze_field_geometry(geometry)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/crops/calendar")
def list_punjab_crop_calendar(ref_date: str | None = None) -> dict[str, Any]:
    try:
        anchor = date.fromisoformat(ref_date) if ref_date else date.today()
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ref_date '{ref_date}': expected ISO YYYY-MM-DD format.",
        ) from exc
    current_season, upcoming_season = get_punjab_season_context(anchor)
    crops: list[CropInfo] = list(PUNJAB_CROPS.values())
    return {
        "reference_date": anchor.isoformat(),
        "current_season": current_season,
        "upcoming_season": upcoming_season,
        "crops": [c.model_dump() for c in crops],
    }


@app.get("/api/data-sources")
def data_sources_overview() -> dict[str, Any]:
    return {
        "catalog_version": "2026.1",
        "keyless_active": ["nasa_power", "sentinel2", "landsat", "srtm_dem", "derived_water_balance"],
        "sources": [source.__dict__ for source in SOURCES],
    }


@app.get("/api/crops/{crop_id}/calendar", response_model=CalendarWindow)
def crop_calendar_endpoint(crop_id: str, ref_date: str | None = None) -> CalendarWindow:
    try:
        anchor = date.fromisoformat(ref_date) if ref_date else date.today()
        return CalendarWindow.model_validate(crop_calendar(crop_id, anchor))
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/irrigation/requirement", response_model=IrrigationResponse)
def irrigation_requirement(req: IrrigationRequest) -> IrrigationResponse:
    crop = PUNJAB_CROPS.get(req.crop_id)
    if crop is None:
        raise HTTPException(status_code=400, detail=f"unknown crop_id '{req.crop_id}'")
    net = net_irrigation_requirement(crop.water_need_mm, req.effective_rainfall_mm, req.soil_storage_mm)
    return IrrigationResponse(
        crop_id=req.crop_id,
        net_requirement_mm=net,
        gross_requirement_mm=gross_irrigation_requirement(net, req.application_efficiency),
        confidence={"quality": "medium", "confidence": 0.6, "source": "crop catalog and supplied field inputs"},
    )


@app.post("/api/irrigation/plan", response_model=IrrigationPlanResponse)
def irrigation_plan(req: IrrigationPlanRequest) -> IrrigationPlanResponse:
    et_crop = req.et0_mm * req.crop_coefficient_kc
    effective_rain = req.effective_rainfall_mm + req.forecast_rainfall_mm
    available = max(0.0, req.field_capacity_mm - req.wilting_point_mm)
    target = available * (1.0 - req.allowable_depletion)
    net = max(0.0, et_crop - effective_rain - target)
    if req.salinity_leaching:
        net += max(5.0, net * 0.1)
    gross = gross_irrigation_requirement(net, req.irrigation_efficiency)
    runtime = gross * 1000 / req.pump_capacity_l_min if req.pump_capacity_l_min else None
    return IrrigationPlanResponse(
        recommended_date=date.today(),
        recommended_depth_mm=gross,
        pump_runtime_minutes=round(runtime, 1) if runtime is not None else None,
        reason=f"ETc = ET0 x Kc = {et_crop:.1f} mm; root-zone depletion is considered.",
        forecast_adjustment=f"Forecast rainfall reduced the requirement by {req.forecast_rainfall_mm:.1f} mm.",
        confidence=QualityConfidence(quality="medium", confidence=0.65, source="supplied ET0, soil and forecast inputs"),
        missed_irrigation_warning="Prioritize irrigation if the root zone is already below the allowable depletion threshold." if gross > 0 else None,
    )


@app.post("/api/irrigation/simulate", response_model=IrrigationPlanResponse)
def irrigation_simulate(req: IrrigationPlanRequest) -> IrrigationPlanResponse:
    return irrigation_plan(req)


@app.post("/api/irrigation/log", response_model=IrrigationLog)
def irrigation_log(log: IrrigationLog) -> IrrigationLog:
    _irrigation_logs.append(log)
    return log


@app.get("/api/irrigation/history", response_model=list[IrrigationLog])
def irrigation_history(field_id: str | None = None) -> list[IrrigationLog]:
    return [log for log in _irrigation_logs if field_id is None or log.field_id == field_id]


@app.post("/api/fields/backup/validate", response_model=BackupPayload)
def validate_backup(payload: BackupPayload) -> BackupPayload:
    return payload


@app.post("/api/fields/backup/restore", response_model=BackupPayload)
def restore_backup(payload: BackupPayload) -> BackupPayload:
    """Validate a browser backup before the client imports it."""
    return payload


@app.post("/api/water/groundwater", response_model=GroundwaterResponse)
def groundwater_estimate(req: GroundwaterRequest) -> GroundwaterResponse:
    pressure = groundwater_pressure(req.irrigation_mm, req.recharge_mm, area_hectares=req.area_hectares)
    return GroundwaterResponse(pressure_mm=pressure, status=groundwater_status(pressure))


@app.post("/api/market/score", response_model=MarketScoreResponse)
def market_score(req: MarketScoreRequest) -> MarketScoreResponse:
    return MarketScoreResponse(demand_level=req.demand_level, score=market_demand_score(req.demand_level))


@app.post("/api/analysis/environment", response_model=EnvironmentalAnalysisResponse)
async def analyze_environment(field: FieldProfile, ref_date: str | None = None) -> EnvironmentalAnalysisResponse:
    try:
        anchor = date.fromisoformat(ref_date) if ref_date else None
        return await run_environmental_analysis(field, ref_date=anchor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/rotations/recommend", response_model=RotationResponse)
def recommend_rotations(req: RotationRequest) -> RotationResponse:
    try:
        return generate_rotation_recommendations(
            field=req.field,
            priorities=req.priorities,
            ref_date_str=req.reference_date,
            analysis=req.analysis,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/soil/health", response_model=SoilHealthResponse)
def soil_health(req: SoilHealthRequest) -> SoilHealthResponse:
    try:
        return evaluate_soil_health(req.field, analysis=req.analysis)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/climate/simulate", response_model=ClimateSimulationResponse)
def climate_simulate(req: ClimateSimulationRequest) -> ClimateSimulationResponse:
    try:
        return run_climate_simulation(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/cache/clear")
def clear_cache() -> dict[str, int]:
    if not settings.allow_cache_clear:
        raise HTTPException(status_code=404, detail="cache clear is disabled")
    deleted = cache_store.clear()
    return {"cleared_entries": deleted}
