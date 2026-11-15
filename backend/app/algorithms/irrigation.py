"""Pure irrigation requirement calculations."""

from __future__ import annotations


def net_irrigation_requirement(
    crop_water_need_mm: float, effective_rainfall_mm: float, soil_storage_mm: float = 0.0
) -> float:
    if crop_water_need_mm < 0 or effective_rainfall_mm < 0 or soil_storage_mm < 0:
        raise ValueError("water quantities cannot be negative")
    return round(max(0.0, crop_water_need_mm - effective_rainfall_mm - soil_storage_mm), 1)


def gross_irrigation_requirement(net_mm: float, efficiency: float) -> float:
    if net_mm < 0:
        raise ValueError("net irrigation cannot be negative")
    if not 0 < efficiency <= 1:
        raise ValueError("efficiency must be greater than zero and at most one")
    return round(net_mm / efficiency, 1)
