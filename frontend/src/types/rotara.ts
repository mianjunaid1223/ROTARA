export type NavTab = "map" | "fields" | "advice" | "expert";

export type IrrigationType =
  | "canal"
  | "tubewell"
  | "conjunctive"
  | "rainfed"
  | "drip_sprinkler";

export type WaterAvailability = "abundant" | "moderate" | "limited" | "scarce";

export type SeasonName = "Rabi" | "Kharif" | "Zaid";

export interface SoilLabInput {
  ph?: number | null;
  organic_matter_pct?: number | null;
  nitrogen_ppm?: number | null;
  phosphorus_ppm?: number | null;
  potassium_ppm?: number | null;
  texture?: "sandy" | "sandy_loam" | "loam" | "clay_loam" | "clay" | "silt_loam" | null;
  salinity_status?: "none" | "slight" | "moderate" | "high" | null;
  ec_ds_m?: number | null;
}

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface FieldProfile {
  id: string;
  name: string;
  geometry: GeoJsonPolygon;
  latitude?: number | null;
  longitude?: number | null;
  current_crop: string;
  previous_crop?: string | null;
  planting_date?: string | null;
  harvest_date?: string | null;
  irrigation_type: IrrigationType;
  water_availability: WaterAvailability;
  soil_lab?: SoilLabInput | null;
  reported_area_acres?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AreaResponse {
  area_hectares: number;
  area_acres: number;
  area_kanals: number;
  perimeter_meters: number;
  centroid_lat: number;
  centroid_lon: number;
  bbox: number[];
  in_punjab: boolean;
  agro_zone_id: string;
  agro_zone_name: string;
  agro_zone_note: string;
}

export interface DataSourceStatus {
  id: string;
  name: string;
  provider: string;
  category: "direct_observation" | "derived_indicator" | "modeled_estimate";
  status: "available" | "partial" | "unavailable";
  spatial_resolution: string;
  temporal_resolution: string;
  observation_window?: string | null;
  latest_date?: string | null;
  scene_count?: number | null;
  limitations: string;
  confidence?: number | null;
}

export interface DailyWeatherPoint {
  date: string;
  rainfall_mm?: number | null;
  temp_mean_c?: number | null;
  temp_max_c?: number | null;
  temp_min_c?: number | null;
  solar_mj_m2?: number | null;
  humidity_pct?: number | null;
  wind_ms?: number | null;
  et0_mm?: number | null;
  water_balance_mm?: number | null;
}

export interface NdviPoint {
  date: string;
  ndvi_mean: number;
  ndwi_mean?: number | null;
  cloud_cover_pct?: number | null;
  sensor: string;
  resolution_m: number;
}

export interface WaterIndicators {
  rainfall_30d_mm?: number | null;
  rainfall_90d_mm?: number | null;
  rainfall_30d_baseline_mm?: number | null;
  rainfall_anomaly_pct?: number | null;
  dry_spell_max_days?: number | null;
  et0_30d_mm?: number | null;
  water_balance_30d_mm?: number | null;
  moisture_proxy_status: "wet" | "adequate" | "dry" | "very_dry" | "unknown";
  farmer_summary: string;
  agronomist_summary: string;
}

export interface ClimateIndicators {
  temp_mean_30d_c?: number | null;
  temp_max_30d_c?: number | null;
  temp_anomaly_c?: number | null;
  heat_stress_days_90d?: number | null;
  frost_risk_days_90d?: number | null;
  solar_mean_30d_mj?: number | null;
  humidity_mean_30d_pct?: number | null;
  farmer_summary: string;
  agronomist_summary: string;
}

export interface VegetationIndicators {
  latest_ndvi?: number | null;
  latest_ndvi_date?: string | null;
  latest_ndvi_sensor?: string | null;
  ndvi_trend_delta?: number | null;
  vegetation_status: "vigorous" | "moderate" | "stressed" | "bare_or_fallow" | "unknown";
  bare_soil_fraction_estimate?: number | null;
  farmer_summary: string;
  agronomist_summary: string;
}

export interface TerrainIndicators {
  elevation_m?: number | null;
  slope_mean_pct?: number | null;
  slope_max_pct?: number | null;
  runoff_susceptibility: "low" | "moderate" | "high" | "unknown";
  erosion_risk: "low" | "moderate" | "high" | "unknown";
  farmer_summary: string;
  agronomist_summary: string;
}

export interface ScientificLimitation {
  topic: string;
  farmer_note: string;
  technical_note: string;
}

export interface EnvironmentalAnalysisResponse {
  field_id: string;
  analyzed_at: string;
  geometry_summary: AreaResponse;
  data_sources: DataSourceStatus[];
  water: WaterIndicators;
  climate: ClimateIndicators;
  vegetation: VegetationIndicators;
  terrain: TerrainIndicators;
  weather_series: DailyWeatherPoint[];
  ndvi_series: NdviPoint[];
  limitations: ScientificLimitation[];
}

export interface FarmerPriorities {
  water_conservation: number;
  soil_improvement: number;
  market_suitability: number;
  climate_resilience: number;
}

export interface SeasonStep {
  slot_label: string;
  season: SeasonName;
  crop_id: string;
  crop_name: string;
  local_name: string;
  planting_window: string;
  harvest_window: string;
  water_demand_level: string;
  nitrogen_fixer: boolean;
  root_depth: string;
  suitability_note: string;
}

export interface CriterionScore {
  criterion: string;
  score: number;
  weight: number;
  weighted_contribution: number;
  evidence: string;
}

export interface RotationStrategy {
  strategy_id: "A" | "B" | "C";
  title: string;
  subtitle: string;
  overall_score: number;
  steps: SeasonStep[];
  criteria_breakdown: CriterionScore[];
  benefits: string[];
  risks_and_limitations: string[];
  supporting_observations: string[];
  missing_information: string[];
  farmer_reason: string;
  farmer_next_step: string;
  agronomist_notes: string;
}

export interface RotationResponse {
  field_id: string;
  reference_date: string;
  current_punjab_season: SeasonName;
  upcoming_planting_season: SeasonName;
  agro_zone_id: string;
  agro_zone_name: string;
  strategies: RotationStrategy[];
  disclaimer: string;
}

export interface CropInfo {
  id: string;
  name: string;
  local_name: string;
  season: SeasonName;
  planting_months: number[];
  harvest_months: number[];
  planting_window_label: string;
  harvest_window_label: string;
  duration_days: number;
  water_need_mm: number;
  water_demand_level: string;
  temp_opt_min_c: number;
  temp_opt_max_c: number;
  heat_tolerance: string;
  drought_tolerance: string;
  root_depth: string;
  nitrogen_fixer: boolean;
  organic_matter_contribution: string;
  crop_family: string;
  crop_group?: string;
  market_demand_punjab: string;
  suitable_zones: string[];
  notes: string;
}

export interface SoilHealthDimension {
  dimension: string;
  source_type: "measured_lab" | "field_history" | "satellite_derived";
  status: "good" | "fair" | "attention" | "missing";
  value_label: string;
  farmer_explanation: string;
  technical_explanation: string;
}

export interface SoilHealthResponse {
  field_id: string;
  measured_lab_present: boolean;
  overall_farmer_summary: string;
  dimensions: SoilHealthDimension[];
  cannot_conclude_without_lab: string[];
  practical_actions: string[];
}

export interface ClimateScenarioInput {
  rainfall_change_pct: number;
  temp_increase_c: number;
  water_availability_override?: WaterAvailability | null;
}

export interface StrategyDelta {
  strategy_id: "A" | "B" | "C";
  title: string;
  baseline_score: number;
  simulated_score: number;
  score_delta: number;
  baseline_rank: number;
  simulated_rank: number;
}

export interface ClimateSimulationResponse {
  field_id: string;
  is_hypothetical: boolean;
  scenario: ClimateScenarioInput;
  baseline_summary: Record<string, string | number | null>;
  simulated_summary: Record<string, string | number | null>;
  strategy_deltas: StrategyDelta[];
  simulated_strategies: RotationStrategy[];
  crop_suitability_shifts: Array<{
    crop_id: string;
    crop_name: string;
    season: SeasonName;
    suitability_change: number;
    direction: "improved" | "reduced" | "stable";
  }>;
  assumptions: string[];
  farmer_takeaway: string;
}

export interface SavedFieldRecord {
  field: FieldProfile;
  area?: AreaResponse;
  analysis?: EnvironmentalAnalysisResponse;
  rotations?: RotationResponse;
  soilHealth?: SoilHealthResponse;
  priorities: FarmerPriorities;
}
