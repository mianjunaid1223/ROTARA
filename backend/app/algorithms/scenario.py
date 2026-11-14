"""Pure scenario shifting functions for climate simulation."""

from __future__ import annotations

from app.algorithms.et0 import compute_fao56_et0
from app.algorithms.indicators import HEAT_STRESS_TMAX_C, classify_moisture_status
from app.models.schemas import DailyWeatherPoint

DEFAULT_FALLBACK_TMAX_C = 31.0
HEAT_DAYS_PER_DEGREE_FALLBACK = 6.0


def multiply_rainfall_anomaly(existing_anomaly_pct: float | None, rain_factor: float) -> float:
    """Apply scenario factor multiplicatively to the existing baseline rainfall ratio.

    Equation:
        new_anomaly(%) = (max(0, (1 + existing/100) * rain_factor) - 1) * 100
    """
    existing_ratio = 1.0 + ((existing_anomaly_pct or 0.0) / 100.0)
    new_ratio = max(0.0, existing_ratio * rain_factor)
    return round((new_ratio - 1.0) * 100.0, 1)


def shift_moisture_status_without_series(
    base_status: str,
    rain_change_pct: int,
    temp_shift: float,
) -> str:
    """Shift qualitative moisture status when daily weather observations are absent."""
    if base_status == "unknown":
        if rain_change_pct <= -35 or (rain_change_pct <= -25 and temp_shift >= 2.0):
            return "very_dry"
        if rain_change_pct <= -15:
            return "dry"
        if rain_change_pct >= 20 and temp_shift <= 0.5:
            return "adequate"
        return "unknown"

    order = ["very_dry", "dry", "adequate", "wet"]
    if base_status not in order:
        return base_status
    idx = order.index(base_status)
    if rain_change_pct <= -20 or (rain_change_pct <= -10 and temp_shift >= 2.0):
        idx = max(0, idx - 1)
    elif rain_change_pct >= 20 and temp_shift <= 0.5:
        idx = min(len(order) - 1, idx + 1)
    return order[idx]


def apply_scenario_to_series(
    weather_series: list[DailyWeatherPoint],
    rain_factor: float,
    temp_shift: float,
    elevation_m: float,
) -> dict[str, float | int | str | None]:
    """Shift observed daily series by rainfall multiplier and temperature delta, then recompute ET0 & heat."""
    shifted_last_30_rain = 0.0
    shifted_last_30_et0 = 0.0
    has_last_30_rain = False
    has_last_30_et0 = False
    shifted_last_30_tmeans: list[float] = []
    shifted_last_30_tmaxs: list[float] = []
    shifted_heat_days = 0
    n_days = len(weather_series)

    for idx, day in enumerate(weather_series):
        r = max(0.0, day.rainfall_mm * rain_factor) if day.rainfall_mm is not None else None
        t_mean = day.temp_mean_c + temp_shift if day.temp_mean_c is not None else None
        t_max = day.temp_max_c + temp_shift if day.temp_max_c is not None else None
        t_min = day.temp_min_c + temp_shift if day.temp_min_c is not None else None
        et0 = compute_fao56_et0(
            t_mean,
            t_max,
            t_min,
            day.solar_mj_m2,
            day.humidity_pct,
            day.wind_ms,
            elevation_m=elevation_m,
        )

        if t_max is not None and t_max >= HEAT_STRESS_TMAX_C:
            shifted_heat_days += 1
        if idx >= max(0, n_days - 30):
            if r is not None:
                shifted_last_30_rain += r
                has_last_30_rain = True
            if et0 is not None:
                shifted_last_30_et0 += et0
                has_last_30_et0 = True
            if t_mean is not None:
                shifted_last_30_tmeans.append(t_mean)
            if t_max is not None:
                shifted_last_30_tmaxs.append(t_max)

    wb: float | None = None
    moisture_status: str | None = None
    rain_30: float | None = None
    et0_30: float | None = None
    if has_last_30_rain and has_last_30_et0:
        rain_30 = round(shifted_last_30_rain, 1)
        et0_30 = round(shifted_last_30_et0, 1)
        wb = round(shifted_last_30_rain - shifted_last_30_et0, 1)
        moisture_status = classify_moisture_status(wb)

    return {
        "rainfall_30d_mm": rain_30,
        "et0_30d_mm": et0_30,
        "water_balance_30d_mm": wb,
        "moisture_status": moisture_status,
        "temp_mean_30d_c": round(sum(shifted_last_30_tmeans) / len(shifted_last_30_tmeans), 1) if shifted_last_30_tmeans else None,
        "temp_max_30d_c": round(sum(shifted_last_30_tmaxs) / len(shifted_last_30_tmaxs), 1) if shifted_last_30_tmaxs else None,
        "heat_days": shifted_heat_days,
    }
