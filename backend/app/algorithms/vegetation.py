"""Optical vegetation index calculations (NDVI, NDWI, bare-soil cover fraction)."""

from __future__ import annotations

from typing import Literal

import numpy as np

from app.models.schemas import NdviPoint, VegetationIndicators

CANOPY_CLOSURE_NDVI = 0.35
BARE_SOIL_NDVI_SPAN = 0.25  # bare Punjab soils sit near 0.10; 0.35 - 0.10 = 0.25
VIGOROUS_NDVI_THRESHOLD = 0.55
MODERATE_NDVI_THRESHOLD = 0.32
STRESSED_NDVI_THRESHOLD = 0.18


def normalized_difference(band_a: np.ndarray, band_b: np.ndarray) -> float | None:
    """Compute field mean normalized difference (A - B) / (A + B) bounded to [-1, 1].

    Inputs:
        band_a: numerator-positive band values (e.g. NIR reflectance)
        band_b: numerator-negative band values (e.g. Red or SWIR reflectance)

    Equation:
        mean((A - B) / (A + B)) over finite pixels where (A + B) > 0 and ratio in [-1, 1].

    Output:
        Mean index rounded to 3 decimal places, or None when no valid pixels exist.
    """
    denom = band_a + band_b
    ratio = np.where(denom > 0, (band_a - band_b) / denom, np.nan)
    valid = ratio[(ratio >= -1.0) & (ratio <= 1.0)]
    if valid.size == 0:
        return None
    return round(float(np.nanmean(valid)), 3)


def estimate_bare_soil_fraction(ndvi: float) -> float:
    """Estimate exposed bare-soil fraction [0, 1] from NDVI.

    Equation:
        clamp((0.35 - NDVI) / 0.25, 0.0, 1.0) when NDVI < 0.35, else 0.0.
        Bare Punjab fields sit near NDVI 0.10 while early canopy closure starts at 0.35.
    """
    if ndvi >= CANOPY_CLOSURE_NDVI:
        return 0.0
    return round(max(0.0, min(1.0, (CANOPY_CLOSURE_NDVI - ndvi) / BARE_SOIL_NDVI_SPAN)), 2)


def classify_vegetation_status(
    ndvi: float,
) -> Literal["vigorous", "moderate", "stressed", "bare_or_fallow"]:
    """Classify field vegetation status from latest NDVI score."""
    if ndvi >= VIGOROUS_NDVI_THRESHOLD:
        return "vigorous"
    if ndvi >= MODERATE_NDVI_THRESHOLD:
        return "moderate"
    if ndvi >= STRESSED_NDVI_THRESHOLD:
        return "stressed"
    return "bare_or_fallow"


def compute_vegetation_indicators(ndvi_series: list[NdviPoint]) -> VegetationIndicators:
    """Summarize satellite NDVI time series into farmer-friendly and technical indicators."""
    if not ndvi_series:
        return VegetationIndicators(
            vegetation_status="unknown",
            farmer_summary="Clear satellite photos for vegetation greenness were unavailable due to clouds or overpass timing.",
            agronomist_summary="No cloud-filtered Sentinel-2 or Landsat scenes returned valid NDVI pixels.",
        )

    latest = ndvi_series[-1]
    val = latest.ndvi_mean
    trend = round(val - ndvi_series[0].ndvi_mean, 3) if len(ndvi_series) >= 2 else None
    bare_est = estimate_bare_soil_fraction(val)
    status = classify_vegetation_status(val)

    if status == "vigorous":
        farmer_msg = (
            f"Healthy green crop cover detected on {latest.date} (vegetation score {val:.2f}). "
            "The canopy looks active and well established."
        )
    elif status == "moderate":
        farmer_msg = (
            f"Moderate crop greenness seen on {latest.date} (score {val:.2f}). "
            "This is typical during early crop growth, crop maturity, or patchy stand cover."
        )
    elif status == "stressed":
        farmer_msg = (
            f"Low greenness detected on {latest.date} (score {val:.2f}). "
            "Your field may be newly planted, drying off near harvest, or experiencing water/crop stress."
        )
    else:
        farmer_msg = (
            f"The field appeared mostly bare soil or post-harvest stubble on {latest.date} (score {val:.2f}). "
            "Leaving soil bare in hot winds increases moisture loss; a short cover crop can protect it."
        )

    agro_msg = (
        f"Latest NDVI: {val:.3f} ({latest.sensor}, {latest.resolution_m}m on {latest.date}); "
        f"observations count: {len(ndvi_series)}."
    )
    if trend is not None:
        agro_msg += f" Window NDVI delta: {trend:+.3f}."

    return VegetationIndicators(
        latest_ndvi=val,
        latest_ndvi_date=latest.date,
        latest_ndvi_sensor=latest.sensor,
        ndvi_trend_delta=trend,
        vegetation_status=status,
        bare_soil_fraction_estimate=bare_est,
        farmer_summary=farmer_msg,
        agronomist_summary=agro_msg,
    )
