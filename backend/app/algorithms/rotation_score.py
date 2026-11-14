"""Continuous multi-criteria rotation scoring functions."""

from __future__ import annotations

from datetime import date

from app.models.schemas import CropInfo, FarmerPriorities, SeasonName

WATER_SCORE_MIN = 15.0
CLIMATE_SCORE_MIN = 15.0
SCORE_MAX = 100.0
SOIL_SCORE_MIN = 15.0

BASE_WATER_SCORE = {
    "low": 94.0,
    "moderate": 76.0,
    "high": 52.0,
    "very_high": 32.0,
}

# Canal/tubewell water scarcity pressure (-1 abundant relief .. +1 scarce stress)
SUPPLY_PRESSURE_MAP = {
    "abundant": -1.0,
    "moderate": 0.0,
    "limited": 0.65,
    "scarce": 1.0,
}

# Scarcity penalty weights per demand class (monotonic: low suffers least, very_high most)
SCARCITY_PENALTY_BY_DEMAND = {
    "low": 6.0,
    "moderate": 15.0,
    "high": 22.0,
    "very_high": 28.0,
}

ABUNDANT_WATER_BONUS = 20.0

# Continuous dryness stress weights on rainfall anomaly and P-ET0 water balance deficit
ANOMALY_NORMALIZER_PCT = 50.0
WB_DEFICIT_NORMALIZER_MM = 150.0
MOISTURE_STATUS_FALLBACK_DEFICIT = {
    "wet": 0.0,
    "adequate": 0.25,
    "dry": 0.65,
    "very_dry": 1.0,
    "unknown": 0.30,
}
DRYNESS_SENSITIVITY_BY_DEMAND = {
    "low": 12.0,
    "moderate": 22.0,
    "high": 28.0,
    "very_high": 34.0,
}
DROUGHT_HIGH_RESILIENCE_FACTOR = 0.70

ZONE_FIT_SCORE = 84.0
ZONE_MISMATCH_SCORE = 58.0
HEAT_DAY_PENALTY_PER_DAY = 0.65
HEAT_DAY_PENALTY_CAP = 20.0
THERMAL_EXCESS_PENALTY_PER_C = 2.8
WARM_DAY_BASELINE_C = 28.0
WARM_DAY_PENALTY_PER_C = 1.4
HEAT_TOLERANCE_FACTOR = {
    "high": 0.35,
    "moderate": 1.0,
    "low": 1.5,
}
RICE_SLOPE_THRESHOLD_PCT = 3.0
RICE_SLOPE_PENALTY = 16.0

MARKET_DEMAND_SCORE = {
    "moderate": 68.0,
    "high": 84.0,
    "very_high": 94.0,
}

FLEX_WEIGHT_SHARE = 0.85
TIMING_WEIGHT_SHARE = 0.15


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def score_crop_water_demand(
    crop: CropInfo,
    water_avail: str,
    moisture_status: str,
    rain_anom_pct: float | None,
    water_balance_30d_mm: float | None = None,
) -> float:
    """Compute continuous crop water suitability score (15 to 100).

    Inputs:
        crop: Punjab crop catalog entry
        water_avail: field water supply ("abundant", "moderate", "limited", "scarce")
        moisture_status: atmospheric moisture proxy ("wet", "adequate", "dry", "very_dry", "unknown")
        rain_anom_pct: 30-day rainfall percent anomaly vs 5-year baseline (%)
        water_balance_30d_mm: 30-day P - ET0 water balance (mm), optional

    Equations:
        supply_penalty = SCARCITY_PENALTY[demand] * clamp(supply_pressure, 0, 1)
        rain_deficit = clamp(-(rain_anom_pct or 0) / 40, 0, 1.25)
        wb_deficit = clamp(-wb / 150, 0, 1.2) (or moisture fallback when wb is None)
        dryness_stress = 0.75 * rain_deficit + 0.45 * wb_deficit
        dryness_penalty = DRYNESS_SENSITIVITY[demand] * drought_factor * dryness_stress
    """
    score = BASE_WATER_SCORE[crop.water_demand_level]
    supply_pressure = SUPPLY_PRESSURE_MAP.get(water_avail, 0.0)

    if supply_pressure > 0.0:
        score -= SCARCITY_PENALTY_BY_DEMAND[crop.water_demand_level] * supply_pressure
    elif supply_pressure < 0.0 and crop.water_demand_level in ("high", "very_high"):
        score += ABUNDANT_WATER_BONUS * (-supply_pressure)

    anom = rain_anom_pct or 0.0
    rain_deficit = _clamp(-anom / ANOMALY_NORMALIZER_PCT, 0.0, 1.6)
    if water_balance_30d_mm is not None:
        wb_deficit = _clamp(-water_balance_30d_mm / WB_DEFICIT_NORMALIZER_MM, 0.0, 1.2)
    else:
        wb_deficit = MOISTURE_STATUS_FALLBACK_DEFICIT.get(moisture_status, 0.30)

    dryness_stress = 0.75 * rain_deficit + 0.45 * wb_deficit
    drought_factor = DROUGHT_HIGH_RESILIENCE_FACTOR if crop.drought_tolerance == "high" else 1.0
    score -= DRYNESS_SENSITIVITY_BY_DEMAND[crop.water_demand_level] * drought_factor * dryness_stress

    if anom > 0.0 and crop.water_demand_level in ("moderate", "high", "very_high"):
        rain_relief = _clamp(anom / ANOMALY_NORMALIZER_PCT, 0.0, 1.0)
        score += 6.0 * rain_relief

    return round(_clamp(score, WATER_SCORE_MIN, SCORE_MAX), 2)


def score_crop_climate_fit(
    crop: CropInfo,
    zone_id: str,
    heat_days: int | None,
    slope_pct: float | None,
    temp_max_mean_c: float | None = None,
) -> float:
    """Compute continuous climate, heat, and terrain fit score (15 to 100).

    Inputs:
        crop: Punjab crop catalog entry
        zone_id: Punjab agro-ecological zone identifier
        heat_days: count of days with Tmax >= 38 C in past 90 days
        slope_pct: mean DEM field slope (%)
        temp_max_mean_c: 30-day average daily maximum temperature (C), optional

    Equations:
        heat_factor = HEAT_TOLERANCE_FACTOR[crop.heat_tolerance]
        day_penalty = min(20, (heat_days or 0) * 0.65) * heat_factor
        temp_excess_penalty = (max(0, Tmax_30d - temp_opt_max) * 2.8 + max(0, Tmax_30d - 28) * 1.4) * heat_factor
    """
    score = ZONE_FIT_SCORE if zone_id in crop.suitable_zones else ZONE_MISMATCH_SCORE
    heat_factor = HEAT_TOLERANCE_FACTOR[crop.heat_tolerance]

    if heat_days is not None and heat_days > 0:
        day_penalty = min(HEAT_DAY_PENALTY_CAP, heat_days * HEAT_DAY_PENALTY_PER_DAY) * heat_factor
        score -= day_penalty

    if temp_max_mean_c is not None:
        excess_above_opt = max(0.0, temp_max_mean_c - crop.temp_opt_max_c)
        ambient_heat = max(0.0, temp_max_mean_c - WARM_DAY_BASELINE_C)
        score -= (
            excess_above_opt * THERMAL_EXCESS_PENALTY_PER_C
            + ambient_heat * WARM_DAY_PENALTY_PER_C
        ) * heat_factor

    if slope_pct is not None and slope_pct >= RICE_SLOPE_THRESHOLD_PCT and crop.id == "rice":
        score -= RICE_SLOPE_PENALTY

    return round(_clamp(score, CLIMATE_SCORE_MIN, SCORE_MAX), 2)


def score_sequence_market(crops: list[CropInfo]) -> float:
    """Average Punjab market demand suitability across crops in a rotation sequence."""
    vals = [MARKET_DEMAND_SCORE[c.market_demand_punjab] for c in crops]
    return sum(vals) / len(vals)


def score_planting_window(first_crop: CropInfo, upcoming_season: SeasonName, ref_date: date) -> tuple[float, str]:
    """Score timing alignment for the first crop in a sequence relative to `ref_date`."""
    if first_crop.season == upcoming_season:
        if ref_date.month in first_crop.planting_months:
            return 95.0, f"Planting window open now ({first_crop.planting_window_label})."
        return 85.0, f"Prepared for upcoming {upcoming_season} window ({first_crop.planting_window_label})."
    return 70.0, f"Scheduled for {first_crop.season} ({first_crop.planting_window_label})."


def compute_priority_weights(priorities: FarmerPriorities) -> tuple[float, float, float, float, float]:
    """Normalize 4 user priorities to 85% weight plus fixed 15% timing weight."""
    raw_sum = (
        priorities.water_conservation
        + priorities.climate_resilience
        + priorities.soil_improvement
        + priorities.market_suitability
    )
    if raw_sum <= 0:
        quarter = FLEX_WEIGHT_SHARE / 4.0
        return quarter, quarter, quarter, quarter, TIMING_WEIGHT_SHARE
    return (
        FLEX_WEIGHT_SHARE * (priorities.water_conservation / raw_sum),
        FLEX_WEIGHT_SHARE * (priorities.climate_resilience / raw_sum),
        FLEX_WEIGHT_SHARE * (priorities.soil_improvement / raw_sum),
        FLEX_WEIGHT_SHARE * (priorities.market_suitability / raw_sum),
        TIMING_WEIGHT_SHARE,
    )
