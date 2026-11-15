"""Provider contracts and explicit source metadata used by analysis responses."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SourceMetadata:
    id: str
    name: str
    provider: str
    category: str
    spatial_resolution: str
    temporal_resolution: str
    limitations: str
    status: str = "available"
    confidence: float | None = None


class WeatherProvider(Protocol):
    async def daily(self, lat: float, lon: float, start: str, end: str) -> list[dict]:
        ...


class SatelliteProvider(Protocol):
    async def scenes(self, geometry: dict, start: str, end: str) -> list[dict]:
        ...


SOURCES = (
    SourceMetadata("nasa_power", "NASA POWER Daily Weather", "NASA", "direct_observation", "~55 km grid", "daily", "Regional grid, not a field microclimate.", confidence=0.8),
    SourceMetadata("sentinel2", "Sentinel-2 L2A", "Copernicus", "direct_observation", "10 m", "5 days nominal", "Cloud cover and revisit gaps can limit observations.", confidence=0.8),
    SourceMetadata("landsat", "Landsat Collection 2", "USGS/NASA", "direct_observation", "30 m", "16 days nominal", "Fallback optical coverage; cloud and revisit gaps apply.", confidence=0.7),
    SourceMetadata("nasadem", "NASADEM", "NASA", "direct_observation", "30 m", "static", "Elevation source used only where configured.", status="unavailable"),
    SourceMetadata("copernicus_dem", "Copernicus GLO-30 DEM", "Copernicus", "direct_observation", "30 m", "static", "Slope is terrain-derived, not a soil measurement.", confidence=0.8),
    SourceMetadata("derived_water_balance", "Rainfall minus ET0", "ROTARA", "derived_indicator", "field summary", "daily", "A modeled indicator; irrigation and soil storage are not observed.", confidence=0.6),
    SourceMetadata("gis_zoning", "Punjab GIS zoning", "Not configured", "direct_observation", "not available", "static", "No verified licensed Punjab polygon provider is configured.", status="unavailable"),
    SourceMetadata("soil_data", "Soil laboratory / supplied inputs", "Farmer or laboratory", "direct_observation", "field sample", "sample date", "Remote sensing cannot infer pH, EC or nutrients.", status="partial"),
    SourceMetadata("market_data", "Market prices and costs", "Not configured", "direct_observation", "market-specific", "user supplied", "No live market feed is configured.", status="unavailable"),
    SourceMetadata("forecast_data", "Weather forecast", "Not configured", "direct_observation", "provider-specific", "forecast window", "Forecasts are unavailable until a provider is configured.", status="unavailable"),
    SourceMetadata("groundwater_data", "Groundwater observations", "Not configured", "direct_observation", "well-specific", "measurement date", "No verified groundwater integration is configured.", status="unavailable"),
)
