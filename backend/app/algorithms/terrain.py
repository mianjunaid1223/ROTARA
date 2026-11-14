"""Terrain slope percentage and runoff/erosion classification from 30 m DEM."""

from __future__ import annotations

from typing import Literal

import numpy as np

METERS_PER_DEGREE_LAT = 111_320.0
DEFAULT_SLOPE_MEAN_PCT = 0.5
DEFAULT_SLOPE_MAX_PCT = 1.0
MAX_PLAUSIBLE_SLOPE_PCT = 200.0
SLOPE_HIGH_PCTILE = 95
LOW_SLOPE_THRESHOLD_PCT = 2.0
MODERATE_SLOPE_THRESHOLD_PCT = 6.0


def compute_slope_statistics(
    elev_grid: np.ndarray,
    field_mask: np.ndarray,
    dy_m: float,
    dx_m: float,
) -> tuple[float, float]:
    """Compute mean slope (%) and 95th-percentile slope (%) inside `field_mask`.

    Inputs:
        elev_grid: 2D array of elevation values (m)
        field_mask: boolean mask matching `elev_grid` for field interior pixels
        dy_m, dx_m: pixel ground spacing in meters (north-south and east-west)

    Equation:
        slope(%) = sqrt((dz/dx)^2 + (dz/dy)^2) * 100
        Factor 100 converts tangent grade (1 m rise per 100 m run = 1%).
    """
    if elev_grid.shape[0] >= 3 and elev_grid.shape[1] >= 3:
        dz_dy, dz_dx = np.gradient(elev_grid, dy_m, dx_m)
        slope_grid = np.sqrt(dz_dx ** 2 + dz_dy ** 2) * 100.0
        slope_pct = slope_grid[field_mask & np.isfinite(slope_grid) & (slope_grid < MAX_PLAUSIBLE_SLOPE_PCT)]
        mean_slope = float(np.nanmean(slope_pct)) if slope_pct.size else DEFAULT_SLOPE_MEAN_PCT
        max_slope = float(np.nanpercentile(slope_pct, SLOPE_HIGH_PCTILE)) if slope_pct.size else DEFAULT_SLOPE_MAX_PCT
        return round(mean_slope, 2), round(max_slope, 2)
    return DEFAULT_SLOPE_MEAN_PCT, DEFAULT_SLOPE_MAX_PCT


def classify_terrain_risk(
    mean_slope_pct: float,
) -> tuple[Literal["low", "moderate", "high"], Literal["low", "moderate", "high"]]:
    """Classify runoff susceptibility and topsoil erosion risk from mean slope (%)."""
    if mean_slope_pct < LOW_SLOPE_THRESHOLD_PCT:
        return "low", "low"
    if mean_slope_pct < MODERATE_SLOPE_THRESHOLD_PCT:
        return "moderate", "moderate"
    return "high", "high"
