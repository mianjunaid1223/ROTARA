from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone

from app.algorithms.et0 import DEFAULT_ELEVATION_M
from app.algorithms.indicators import compute_climate_indicators, compute_water_indicators
from app.algorithms.vegetation import compute_vegetation_indicators
from app.models.schemas import (
    DataSourceStatus,
    EnvironmentalAnalysisResponse,
    FieldProfile,
    ScientificLimitation,
)
from app.services.geo import analyze_field_geometry, extract_polygon
from app.services.nasa.planetary_computer import (
    fetch_sentinel2_and_landsat,
    fetch_terrain_dem,
)
from app.services.nasa.power import fetch_power_raw_bundle, split_power_bundle


def _default_limitations() -> list[ScientificLimitation]:
    return [
        ScientificLimitation(
            topic="Vegetation Greenness (NDVI)",
            farmer_note="Satellite greenness shows how leafy the crop looks, not how fertile the soil is or what nutrients are missing.",
            technical_note="Sentinel-2 (10m) and Landsat (30m) NDVI capture canopy reflectance ratios; nutrient status requires soil lab testing.",
        ),
        ScientificLimitation(
            topic="Moisture & Weather Grid Resolution",
            farmer_note="Weather and rainfall figures come from regional satellite grids (~55 km wide) and do not include your own canal turns or tubewell irrigations.",
            technical_note="NASA POWER (0.5x0.625 deg) represents grid-cell weather; actual root-zone moisture depends on unmeasured irrigation applications.",
        ),
        ScientificLimitation(
            topic="Terrain & Erosion Risk",
            farmer_note="Slope numbers show whether land naturally drains or sheds water during heavy rain, not actual measured soil loss.",
            technical_note="30m DEM slope indicates potential runoff susceptibility and does not capture laser-leveling or small field bunds.",
        ),
    ]


async def run_environmental_analysis(
    field: FieldProfile,
    ref_date: date | None = None,
) -> EnvironmentalAnalysisResponse:
    """Fetch DEM, NASA POWER weather, and optical NDVI concurrently, then compute indicators."""
    geom_summary = analyze_field_geometry(field.geometry)
    geom = extract_polygon(field.geometry)

    # Start all 3 remote fetches in parallel; POWER ET0 applies DEM elevation afterward
    (terrain, dem_status), (raw_power, anchor, power_err), (ndvi_series, s2_status, l8_status) = (
        await asyncio.gather(
            fetch_terrain_dem(geom),
            fetch_power_raw_bundle(geom_summary.centroid_lat, geom_summary.centroid_lon, ref_date=ref_date),
            fetch_sentinel2_and_landsat(geom, ref_date=ref_date),
        )
    )

    elev_m = terrain.elevation_m if terrain.elevation_m is not None else DEFAULT_ELEVATION_M
    weather_series, baseline_series, power_status = split_power_bundle(
        raw_power,
        anchor,
        elevation_m=elev_m,
        error_message=power_err,
    )

    water = compute_water_indicators(weather_series, baseline_series)
    climate = compute_climate_indicators(weather_series, baseline_series)
    vegetation = compute_vegetation_indicators(ndvi_series)

    water_balance_source = DataSourceStatus(
        id="derived_water_balance",
        name="Derived Field Water Balance (P - FAO-56 ET0)",
        provider="ROTARA Analytical Engine",
        category="derived_indicator",
        status="available" if weather_series else "unavailable",
        spatial_resolution="Derived from 0.5 deg NASA POWER + 30m DEM elevation",
        temporal_resolution="Daily",
        observation_window=power_status.observation_window,
        latest_date=power_status.latest_date,
        scene_count=len(weather_series),
        limitations=(
            "Computed atmospheric water balance excluding farmer irrigation. Used as a regional "
            "dryness proxy alongside farmer water availability inputs."
        ),
    )

    return EnvironmentalAnalysisResponse(
        field_id=field.id,
        analyzed_at=datetime.now(timezone.utc).isoformat(),
        geometry_summary=geom_summary,
        data_sources=[power_status, s2_status, l8_status, dem_status, water_balance_source],
        water=water,
        climate=climate,
        vegetation=vegetation,
        terrain=terrain,
        weather_series=weather_series[-90:],
        ndvi_series=ndvi_series,
        limitations=_default_limitations(),
    )
