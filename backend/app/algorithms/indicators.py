"""Aggregation of daily NASA POWER weather into water and climate indicators."""

from __future__ import annotations

from typing import Literal

import numpy as np

from app.models.schemas import ClimateIndicators, DailyWeatherPoint, WaterIndicators

RECENT_WINDOW_DAYS = 30
QUARTER_WINDOW_DAYS = 90
WET_BALANCE_THRESHOLD_MM = 10.0
ADEQUATE_BALANCE_THRESHOLD_MM = -65.0
DRY_BALANCE_THRESHOLD_MM = -120.0
DRY_DAY_RAIN_THRESHOLD_MM = 1.0
MIN_BASELINE_RAIN_MM = 5.0
HEAT_STRESS_TMAX_C = 38.0
FROST_RISK_TMIN_C = 4.0
HIGH_HEAT_DAYS_ALERT = 15
WARM_ANOMALY_ALERT_C = 1.5
FROST_DAYS_ALERT = 3


def classify_moisture_status(
    wb_30_mm: float | None,
) -> Literal["wet", "adequate", "dry", "very_dry", "unknown"]:
    """Classify 30-day atmospheric water balance (P - ET0) into Punjab moisture classes."""
    if wb_30_mm is None:
        return "unknown"
    if wb_30_mm >= WET_BALANCE_THRESHOLD_MM:
        return "wet"
    if wb_30_mm >= ADEQUATE_BALANCE_THRESHOLD_MM:
        return "adequate"
    if wb_30_mm >= DRY_BALANCE_THRESHOLD_MM:
        return "dry"
    return "very_dry"


def compute_water_indicators(
    recent: list[DailyWeatherPoint],
    baseline: list[DailyWeatherPoint],
) -> WaterIndicators:
    """Aggregate recent 90-day weather and 5-year same-window baseline into water indicators.

    Preserves None for any metric lacking observations and marks moisture_proxy_status
    as "unknown" whenever rainfall or ET0 is missing for the 30-day window.
    """
    if not recent:
        return WaterIndicators(
            moisture_proxy_status="unknown",
            farmer_summary="Recent rainfall and water balance data are unavailable right now.",
            agronomist_summary="No NASA POWER meteorological observations available for water balance calculation.",
        )

    last_30 = recent[-RECENT_WINDOW_DAYS:]
    last_90 = recent[-QUARTER_WINDOW_DAYS:]

    rain_30_vals = [p.rainfall_mm for p in last_30 if p.rainfall_mm is not None]
    rain_90_vals = [p.rainfall_mm for p in last_90 if p.rainfall_mm is not None]
    et0_30_vals = [p.et0_mm for p in last_30 if p.et0_mm is not None]

    rain_30 = sum(rain_30_vals) if rain_30_vals else None
    rain_90 = sum(rain_90_vals) if rain_90_vals else None
    et0_30 = sum(et0_30_vals) if et0_30_vals else None
    wb_30 = (rain_30 - et0_30) if (rain_30 is not None and et0_30 is not None) else None

    max_dry: int | None = None
    if rain_90_vals:
        max_dry = 0
        cur_dry = 0
        for p in last_90:
            if p.rainfall_mm is not None and p.rainfall_mm < DRY_DAY_RAIN_THRESHOLD_MM:
                cur_dry += 1
                max_dry = max(max_dry, cur_dry)
            elif p.rainfall_mm is not None:
                cur_dry = 0

    baseline_30_total = None
    anomaly_pct = None
    baseline_rain_vals = [p.rainfall_mm for p in baseline if p.rainfall_mm is not None]
    if baseline_rain_vals:
        total_b_rain = sum(baseline_rain_vals)
        n_years = max(1.0, len(baseline_rain_vals) / float(RECENT_WINDOW_DAYS))
        baseline_30_total = round(total_b_rain / n_years, 1)
        if rain_30 is not None and baseline_30_total >= MIN_BASELINE_RAIN_MM:
            anomaly_pct = round(((rain_30 - baseline_30_total) / baseline_30_total) * 100.0, 1)

    moisture_status = classify_moisture_status(wb_30) if (rain_30 is not None and et0_30 is not None) else "unknown"
    if moisture_status == "unknown":
        if rain_30 is not None:
            farmer_msg = (
                f"Recent rainfall totaled {rain_30:.0f} mm in 30 days, but evaporation (ET0) could not be computed "
                "from available weather parameters."
            )
        else:
            farmer_msg = "Recent rainfall and water balance observations are incomplete for this period."
    elif moisture_status == "wet":
        farmer_msg = (
            f"Recent rainfall ({rain_30:.0f} mm in 30 days) has exceeded crop water demand. "
            "Check field drainage before irrigating."
        )
    elif moisture_status == "adequate":
        farmer_msg = (
            f"Moisture conditions are near normal ({rain_30:.0f} mm rain vs {et0_30:.0f} mm evaporation over 30 days). "
            "Follow your usual irrigation schedule."
        )
    elif moisture_status == "dry":
        dry_note = f", longest dry stretch {max_dry} days" if max_dry is not None else ""
        farmer_msg = (
            f"Your field has been drier than usual ({rain_30:.0f} mm rain vs {et0_30:.0f} mm water loss over 30 days"
            f"{dry_note}). Review irrigation timing and consider water-saving crops."
        )
    else:
        farmer_msg = (
            f"Strong drying conditions detected ({rain_30:.0f} mm rain vs {et0_30:.0f} mm evaporative demand over 30 days). "
            "Avoid water-heavy crops unless canal or tubewell supply is reliable."
        )

    rain_30_str = f"{rain_30:.1f} mm" if rain_30 is not None else "n/a"
    rain_90_str = f"{rain_90:.1f} mm" if rain_90 is not None else "n/a"
    et0_30_str = f"{et0_30:.1f} mm" if et0_30 is not None else "n/a"
    wb_30_str = f"{wb_30:.1f} mm" if wb_30 is not None else "n/a"
    dry_str = f"{max_dry} days" if max_dry is not None else "n/a"
    agro_msg = (
        f"30d precipitation: {rain_30_str}; 90d precipitation: {rain_90_str}; "
        f"30d FAO-56 ET0: {et0_30_str}; 30d net water balance (P - ET0): {wb_30_str}; "
        f"90d max dry spell: {dry_str}."
    )
    if anomaly_pct is not None and baseline_30_total is not None:
        agro_msg += f" 5-yr same-window baseline: {baseline_30_total:.1f} mm ({anomaly_pct:+.1f}%)."

    return WaterIndicators(
        rainfall_30d_mm=round(rain_30, 1) if rain_30 is not None else None,
        rainfall_90d_mm=round(rain_90, 1) if rain_90 is not None else None,
        rainfall_30d_baseline_mm=baseline_30_total,
        rainfall_anomaly_pct=anomaly_pct,
        dry_spell_max_days=max_dry,
        et0_30d_mm=round(et0_30, 1) if et0_30 is not None else None,
        water_balance_30d_mm=round(wb_30, 1) if wb_30 is not None else None,
        moisture_proxy_status=moisture_status,
        farmer_summary=farmer_msg,
        agronomist_summary=agro_msg,
    )


def compute_climate_indicators(
    recent: list[DailyWeatherPoint],
    baseline: list[DailyWeatherPoint],
) -> ClimateIndicators:
    """Aggregate recent temperature, solar, humidity, heat-stress days, and 5-year temp anomaly."""
    if not recent:
        return ClimateIndicators(
            farmer_summary="Recent temperature and solar observations are unavailable right now.",
            agronomist_summary="No NASA POWER observations available for climate summary.",
        )

    last_30 = recent[-RECENT_WINDOW_DAYS:]
    last_90 = recent[-QUARTER_WINDOW_DAYS:]

    t_means = [p.temp_mean_c for p in last_30 if p.temp_mean_c is not None]
    t_maxs = [p.temp_max_c for p in last_30 if p.temp_max_c is not None]
    solars = [p.solar_mj_m2 for p in last_30 if p.solar_mj_m2 is not None]
    rhs = [p.humidity_pct for p in last_30 if p.humidity_pct is not None]

    mean_30 = float(np.mean(t_means)) if t_means else None
    max_30 = float(np.mean(t_maxs)) if t_maxs else None
    solar_30 = float(np.mean(solars)) if solars else None
    rh_30 = float(np.mean(rhs)) if rhs else None

    heat_days = sum(1 for p in last_90 if p.temp_max_c is not None and p.temp_max_c >= HEAT_STRESS_TMAX_C)
    frost_days = sum(1 for p in last_90 if p.temp_min_c is not None and p.temp_min_c <= FROST_RISK_TMIN_C)

    b_means = [p.temp_mean_c for p in baseline if p.temp_mean_c is not None]
    temp_anom = round(mean_30 - float(np.mean(b_means)), 2) if (mean_30 is not None and b_means) else None

    if mean_30 is None and max_30 is None:
        farmer_msg = (
            "Recent air temperature observations are unavailable for this period; "
            "only valid precipitation or radiation records are shown."
        )
    elif heat_days >= HIGH_HEAT_DAYS_ALERT and max_30 is not None:
        farmer_msg = (
            f"Hot weather recently: daytime highs averaged {max_30:.1f} C with {heat_days} hot days (38 C+) "
            "in the last 3 months. Heat-tolerant varieties and timely irrigation help protect flowering."
        )
    elif temp_anom is not None and temp_anom >= WARM_ANOMALY_ALERT_C and mean_30 is not None:
        farmer_msg = (
            f"Temperatures averaged {mean_30:.1f} C over the past 30 days, about {temp_anom:.1f} C warmer "
            "than the 5-year average for this time of year."
        )
    elif frost_days >= FROST_DAYS_ALERT:
        farmer_msg = (
            f"Cool nights recorded ({frost_days} cold nights below 4 C in 90 days). "
            "Winter crops like wheat, chickpea, and mustard handle this well."
        )
    else:
        mean_lbl = f"{mean_30:.1f} C" if mean_30 is not None else "unavailable"
        max_lbl = f"{max_30:.1f} C" if max_30 is not None else "unavailable"
        farmer_msg = (
            f"Temperatures over the past 30 days averaged {mean_lbl} (highs {max_lbl}), "
            "within normal seasonal range for Punjab."
        )

    mean_agro = f"{mean_30:.1f} C" if mean_30 is not None else "n/a"
    max_agro = f"{max_30:.1f} C" if max_30 is not None else "n/a"
    agro_msg = (
        f"30d T2M mean: {mean_agro}; 30d T2M_MAX mean: {max_agro}; "
        f"90d heat-stress days (>=38 C): {heat_days}; 90d cold days (<=4 C): {frost_days}."
    )
    if temp_anom is not None:
        agro_msg += f" 5-yr temperature anomaly: {temp_anom:+.2f} C."

    return ClimateIndicators(
        temp_mean_30d_c=round(mean_30, 1) if mean_30 is not None else None,
        temp_max_30d_c=round(max_30, 1) if max_30 is not None else None,
        temp_anomaly_c=temp_anom,
        heat_stress_days_90d=heat_days,
        frost_risk_days_90d=frost_days,
        solar_mean_30d_mj=round(solar_30, 1) if solar_30 is not None else None,
        humidity_mean_30d_pct=round(rh_30, 1) if rh_30 is not None else None,
        farmer_summary=farmer_msg,
        agronomist_summary=agro_msg,
    )
