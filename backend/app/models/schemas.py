from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator


IrrigationType = Literal[
    "canal",
    "tubewell",
    "conjunctive",
    "rainfed",
    "drip_sprinkler",
]

WaterAvailability = Literal["abundant", "moderate", "limited", "scarce"]

SeasonName = Literal["Rabi", "Kharif", "Zaid"]


class SoilLabInput(BaseModel):
    ph: float | None = Field(default=None, ge=3.5, le=10.5)
    organic_matter_pct: float | None = Field(default=None, ge=0.0, le=15.0)
    nitrogen_ppm: float | None = Field(default=None, ge=0.0, le=1000.0)
    phosphorus_ppm: float | None = Field(default=None, ge=0.0, le=500.0)
    potassium_ppm: float | None = Field(default=None, ge=0.0, le=2000.0)
    texture: Literal["sandy", "sandy_loam", "loam", "clay_loam", "clay", "silt_loam"] | None = None
    salinity_status: Literal["none", "slight", "moderate", "high"] | None = None
    ec_ds_m: float | None = Field(default=None, ge=0.0, le=25.0)


class FieldProfile(BaseModel):
    id: str = "field-1"
    name: str = "My Punjab Field"
    geometry: dict[str, Any]  # GeoJSON Polygon or Feature
    current_crop: str = "wheat"
    previous_crop: str | None = None
    planting_date: str | None = None
    harvest_date: str | None = None
    irrigation_type: IrrigationType = "conjunctive"
    water_availability: WaterAvailability = "moderate"
    soil_lab: SoilLabInput | None = None
    reported_area_acres: float | None = None


class AreaResponse(BaseModel):
    area_hectares: float
    area_acres: float
    area_kanals: float
    perimeter_meters: float
    centroid_lat: float
    centroid_lon: float
    bbox: list[float]
    in_punjab: bool
    agro_zone_id: str
    agro_zone_name: str
    agro_zone_note: str


class DataSourceStatus(BaseModel):
    id: str
    name: str
    provider: str
    category: Literal["direct_observation", "derived_indicator", "modeled_estimate"]
    status: Literal["available", "partial", "unavailable"]
    spatial_resolution: str
    temporal_resolution: str
    observation_window: str | None = None
    latest_date: str | None = None
    scene_count: int | None = None
    limitations: str
    setup_hint: str | None = None


class DailyWeatherPoint(BaseModel):
    date: str
    rainfall_mm: float | None = None
    temp_mean_c: float | None = None
    temp_max_c: float | None = None
    temp_min_c: float | None = None
    solar_mj_m2: float | None = None
    humidity_pct: float | None = None
    wind_ms: float | None = None
    et0_mm: float | None = None
    water_balance_mm: float | None = None


class NdviPoint(BaseModel):
    date: str
    ndvi_mean: float
    ndwi_mean: float | None = None
    cloud_cover_pct: float | None = None
    sensor: str
    resolution_m: int


class WaterIndicators(BaseModel):
    rainfall_30d_mm: float | None = None
    rainfall_90d_mm: float | None = None
    rainfall_30d_baseline_mm: float | None = None
    rainfall_anomaly_pct: float | None = None
    dry_spell_max_days: int | None = None
    et0_30d_mm: float | None = None
    water_balance_30d_mm: float | None = None
    moisture_proxy_status: Literal["wet", "adequate", "dry", "very_dry", "unknown"]
    farmer_summary: str
    agronomist_summary: str


class ClimateIndicators(BaseModel):
    temp_mean_30d_c: float | None = None
    temp_max_30d_c: float | None = None
    temp_anomaly_c: float | None = None
    heat_stress_days_90d: int | None = None
    frost_risk_days_90d: int | None = None
    solar_mean_30d_mj: float | None = None
    humidity_mean_30d_pct: float | None = None
    farmer_summary: str
    agronomist_summary: str


class VegetationIndicators(BaseModel):
    latest_ndvi: float | None = None
    latest_ndvi_date: str | None = None
    latest_ndvi_sensor: str | None = None
    ndvi_trend_delta: float | None = None
    vegetation_status: Literal["vigorous", "moderate", "stressed", "bare_or_fallow", "unknown"]
    bare_soil_fraction_estimate: float | None = None
    farmer_summary: str
    agronomist_summary: str


class TerrainIndicators(BaseModel):
    elevation_m: float | None = None
    slope_mean_pct: float | None = None
    slope_max_pct: float | None = None
    runoff_susceptibility: Literal["low", "moderate", "high", "unknown"]
    erosion_risk: Literal["low", "moderate", "high", "unknown"]
    farmer_summary: str
    agronomist_summary: str


class ScientificLimitation(BaseModel):
    topic: str
    farmer_note: str
    technical_note: str


class EnvironmentalAnalysisResponse(BaseModel):
    field_id: str
    analyzed_at: str
    geometry_summary: AreaResponse
    data_sources: list[DataSourceStatus]
    water: WaterIndicators
    climate: ClimateIndicators
    vegetation: VegetationIndicators
    terrain: TerrainIndicators
    weather_series: list[DailyWeatherPoint]
    ndvi_series: list[NdviPoint]
    limitations: list[ScientificLimitation]


class FarmerPriorities(BaseModel):
    water_conservation: int = Field(default=3, ge=1, le=5)
    soil_improvement: int = Field(default=3, ge=1, le=5)
    market_suitability: int = Field(default=3, ge=1, le=5)
    climate_resilience: int = Field(default=3, ge=1, le=5)


class CropInfo(BaseModel):
    id: str
    name: str
    local_name: str
    season: SeasonName
    planting_months: list[int]
    harvest_months: list[int]
    planting_window_label: str
    harvest_window_label: str
    duration_days: int
    water_need_mm: int
    water_demand_level: Literal["low", "moderate", "high", "very_high"]
    temp_opt_min_c: float
    temp_opt_max_c: float
    heat_tolerance: Literal["low", "moderate", "high"]
    drought_tolerance: Literal["low", "moderate", "high"]
    root_depth: Literal["shallow", "medium", "deep"]
    nitrogen_fixer: bool
    organic_matter_contribution: Literal["low", "moderate", "high"]
    crop_family: str
    crop_group: str = ""
    market_demand_punjab: Literal["moderate", "high", "very_high"]
    suitable_zones: list[str]
    notes: str


class SeasonStep(BaseModel):
    slot_label: str
    season: SeasonName
    crop_id: str
    crop_name: str
    local_name: str
    planting_window: str
    harvest_window: str
    water_demand_level: str
    nitrogen_fixer: bool
    root_depth: str
    suitability_note: str


class CriterionScore(BaseModel):
    criterion: str
    score: float
    weight: float
    weighted_contribution: float
    evidence: str


class RotationStrategy(BaseModel):
    strategy_id: Literal["A", "B", "C"]
    title: str
    subtitle: str
    overall_score: float
    steps: list[SeasonStep]
    criteria_breakdown: list[CriterionScore]
    benefits: list[str]
    risks_and_limitations: list[str]
    supporting_observations: list[str]
    missing_information: list[str]
    farmer_reason: str
    farmer_next_step: str
    agronomist_notes: str


class _FieldWithOptionalAnalysis(BaseModel):
    field: FieldProfile
    analysis: EnvironmentalAnalysisResponse | None = None

    @model_validator(mode="after")
    def _validate_analysis_field_id(self) -> "_FieldWithOptionalAnalysis":
        if self.analysis is not None and self.analysis.field_id != self.field.id:
            raise ValueError(
                f"analysis.field_id ({self.analysis.field_id}) does not match field.id ({self.field.id})."
            )
        return self


class RotationRequest(_FieldWithOptionalAnalysis):
    priorities: FarmerPriorities = Field(default_factory=FarmerPriorities)
    reference_date: str | None = None


class RotationResponse(BaseModel):
    field_id: str
    reference_date: str
    current_punjab_season: SeasonName
    upcoming_planting_season: SeasonName
    agro_zone_id: str
    agro_zone_name: str
    strategies: list[RotationStrategy]
    disclaimer: str


class SoilHealthDimension(BaseModel):
    dimension: str
    source_type: Literal["measured_lab", "field_history", "satellite_derived"]
    status: Literal["good", "fair", "attention", "missing"]
    value_label: str
    farmer_explanation: str
    technical_explanation: str


class SoilHealthRequest(_FieldWithOptionalAnalysis):
    pass


class SoilHealthResponse(BaseModel):
    field_id: str
    measured_lab_present: bool
    overall_farmer_summary: str
    dimensions: list[SoilHealthDimension]
    cannot_conclude_without_lab: list[str]
    practical_actions: list[str]


class ClimateScenarioInput(BaseModel):
    rainfall_change_pct: int = Field(default=0, ge=-50, le=50)
    temp_increase_c: float = Field(default=0.0, ge=-1.0, le=5.0)
    water_availability_override: WaterAvailability | None = None


class ClimateSimulationRequest(_FieldWithOptionalAnalysis):
    priorities: FarmerPriorities = Field(default_factory=FarmerPriorities)
    scenario: ClimateScenarioInput
    reference_date: str | None = None


class StrategyDelta(BaseModel):
    strategy_id: Literal["A", "B", "C"]
    title: str
    baseline_score: float
    simulated_score: float
    score_delta: float
    baseline_rank: int
    simulated_rank: int


class ClimateSimulationResponse(BaseModel):
    field_id: str
    is_hypothetical: bool = True
    scenario: ClimateScenarioInput
    baseline_summary: dict[str, Any]
    simulated_summary: dict[str, Any]
    strategy_deltas: list[StrategyDelta]
    simulated_strategies: list[RotationStrategy]
    crop_suitability_shifts: list[dict[str, Any]]
    assumptions: list[str]
    farmer_takeaway: str
