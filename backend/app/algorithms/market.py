"""Pure market and groundwater estimates (transparent, not price forecasts)."""

from __future__ import annotations

DEMAND_SCORE = {"moderate": 68.0, "high": 84.0, "very_high": 94.0}


def market_demand_score(level: str) -> float:
    return DEMAND_SCORE.get(level, 50.0)


def groundwater_pressure(
    irrigation_mm: float, recharge_mm: float, *, area_hectares: float = 1.0
) -> float:
    """Estimate net groundwater withdrawal pressure as mm over the field."""
    if area_hectares <= 0:
        raise ValueError("area_hectares must be positive")
    return round(max(0.0, float(irrigation_mm) - max(0.0, float(recharge_mm))), 2)


def groundwater_status(pressure_mm: float) -> str:
    if pressure_mm <= 50:
        return "low"
    if pressure_mm <= 150:
        return "moderate"
    return "high"
