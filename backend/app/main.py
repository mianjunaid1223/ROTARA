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
)
from app.services.analysis.climate_sim import run_climate_simulation
from app.services.analysis.environment import run_environmental_analysis
from app.services.analysis.soil_health import evaluate_soil_health
from app.services.crops.punjab_data import PUNJAB_CROPS, get_punjab_season_context
from app.services.crops.rotation_engine import generate_rotation_recommendations
from app.services.geo import analyze_field_geometry

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Earth-informed crop rotation intelligence API for Punjab, Pakistan.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        "keyless_active": ["nasa_power", "sentinel2", "landsat", "srtm_dem", "derived_water_balance"],
    }


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
    deleted = cache_store.clear()
    return {"cleared_entries": deleted}
