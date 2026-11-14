from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import httpx

from app.algorithms.et0 import DEFAULT_ELEVATION_M, compute_fao56_et0
from app.cache.store import cache_store
from app.config import settings
from app.models.schemas import DailyWeatherPoint, DataSourceStatus

POWER_PARAMS = [
    "PRECTOTCORR",
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "ALLSKY_SFC_SW_DWN",
    "RH2M",
    "WS2M",
]

POWER_RECENT_LOOKBACK_DAYS = 125
POWER_BASELINE_YEARS = 5
POWER_BASELINE_WINDOW_DAYS = 30
POWER_SENTINEL_CUTOFF = -900.0


def _clean_power_val(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    if f <= POWER_SENTINEL_CUTOFF:
        return None
    return f


def _week_cache_tag(anchor: date) -> str:
    iso = anchor.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


async def fetch_nasa_power_window(
    lat: float,
    lon: float,
    start_date: date,
    end_date: date,
    cache_tag: str | None = None,
) -> dict[str, Any]:
    """Fetch daily NASA POWER agroclimatology observations for a point and date span."""
    cache_params = {
        "parameters": ",".join(POWER_PARAMS),
        "community": "AG",
        "longitude": round(lon, 4),
        "latitude": round(lat, 4),
        "bucket": cache_tag or f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}",
    }
    cached = cache_store.get("nasa_power", cache_params)
    if cached is not None:
        return cached

    request_params = {
        "parameters": ",".join(POWER_PARAMS),
        "community": "AG",
        "longitude": round(lon, 4),
        "latitude": round(lat, 4),
        "start": start_date.strftime("%Y%m%d"),
        "end": end_date.strftime("%Y%m%d"),
        "format": "JSON",
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(settings.nasa_power_base_url, params=request_params)
        resp.raise_for_status()
        data = resp.json()

    cache_store.set("nasa_power", cache_params, data)
    return data


def parse_power_series(
    raw: dict[str, Any],
    elevation_m: float = DEFAULT_ELEVATION_M,
    start_filter: date | None = None,
    end_filter: date | None = None,
) -> list[DailyWeatherPoint]:
    """Parse NASA POWER parameter maps into DailyWeatherPoint records with FAO-56 ET0."""
    param_block = raw.get("properties", {}).get("parameter", {})
    rain_map = param_block.get("PRECTOTCORR", {})
    t_mean_map = param_block.get("T2M", {})
    t_max_map = param_block.get("T2M_MAX", {})
    t_min_map = param_block.get("T2M_MIN", {})
    rs_map = param_block.get("ALLSKY_SFC_SW_DWN", {})
    rh_map = param_block.get("RH2M", {})
    ws_map = param_block.get("WS2M", {})

    start_key = start_filter.strftime("%Y%m%d") if start_filter else None
    end_key = end_filter.strftime("%Y%m%d") if end_filter else None

    dates = sorted(set(t_mean_map.keys()) | set(rain_map.keys()))
    series: list[DailyWeatherPoint] = []
    for d in dates:
        if start_key and d < start_key:
            continue
        if end_key and d > end_key:
            continue

        rain = _clean_power_val(rain_map.get(d))
        t_mean = _clean_power_val(t_mean_map.get(d))
        t_max = _clean_power_val(t_max_map.get(d))
        t_min = _clean_power_val(t_min_map.get(d))
        rs = _clean_power_val(rs_map.get(d))
        rh = _clean_power_val(rh_map.get(d))
        ws = _clean_power_val(ws_map.get(d))

        if rain is None and t_mean is None and t_max is None:
            continue

        iso_date = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
        et0 = compute_fao56_et0(t_mean, t_max, t_min, rs, rh, ws, elevation_m=elevation_m)
        wb = round(rain - et0, 2) if (rain is not None and et0 is not None) else None

        series.append(
            DailyWeatherPoint(
                date=iso_date,
                rainfall_mm=round(rain, 2) if rain is not None else None,
                temp_mean_c=round(t_mean, 2) if t_mean is not None else None,
                temp_max_c=round(t_max, 2) if t_max is not None else None,
                temp_min_c=round(t_min, 2) if t_min is not None else None,
                solar_mj_m2=round(rs, 2) if rs is not None else None,
                humidity_pct=round(rh, 1) if rh is not None else None,
                wind_ms=round(ws, 2) if ws is not None else None,
                et0_mm=et0,
                water_balance_mm=wb,
            )
        )
    return series


def _baseline_windows_for_anchor(latest_obs_date: date) -> list[tuple[date, date]]:
    windows: list[tuple[date, date]] = []
    for year_offset in range(1, POWER_BASELINE_YEARS + 1):
        try:
            b_end = latest_obs_date.replace(year=latest_obs_date.year - year_offset)
        except ValueError:
            b_end = latest_obs_date - timedelta(days=365 * year_offset)
        windows.append((b_end - timedelta(days=POWER_BASELINE_WINDOW_DAYS), b_end))
    return windows


async def fetch_power_raw_bundle(
    lat: float,
    lon: float,
    ref_date: date | None = None,
) -> tuple[dict[str, Any] | None, date, str | None]:
    """Fetch a single multi-year NASA POWER response spanning recent + 5-year baseline."""
    anchor = ref_date or date.today()
    full_start = anchor - timedelta(days=366 * POWER_BASELINE_YEARS + POWER_BASELINE_WINDOW_DAYS + 5)
    try:
        raw = await fetch_nasa_power_window(
            lat,
            lon,
            full_start,
            anchor,
            cache_tag=_week_cache_tag(anchor),
        )
        return raw, anchor, None
    except Exception as exc:
        return None, anchor, str(exc)


def split_power_bundle(
    raw: dict[str, Any] | None,
    anchor: date,
    elevation_m: float = DEFAULT_ELEVATION_M,
    error_message: str | None = None,
) -> tuple[list[DailyWeatherPoint], list[DailyWeatherPoint], DataSourceStatus]:
    """Slice a raw multi-year NASA POWER response into recent 125-day and 5-year baseline series."""
    if raw is None:
        status = DataSourceStatus(
            id="nasa_power",
            name="NASA POWER Agroclimatology",
            provider="NASA Langley Research Center",
            category="modeled_estimate",
            status="unavailable",
            spatial_resolution="0.5 x 0.625 deg (~55 km grid)",
            temporal_resolution="Daily",
            limitations=f"NASA POWER request failed: {error_message or 'no data returned'}",
        )
        return [], [], status

    recent_start = anchor - timedelta(days=POWER_RECENT_LOOKBACK_DAYS)
    recent_series = parse_power_series(
        raw,
        elevation_m=elevation_m,
        start_filter=recent_start,
        end_filter=anchor,
    )

    latest_obs_date = (
        date.fromisoformat(recent_series[-1].date)
        if recent_series
        else anchor - timedelta(days=5)
    )
    baseline_windows = _baseline_windows_for_anchor(latest_obs_date)

    baseline_points: list[DailyWeatherPoint] = []
    missing_windows = 0
    for b_start, b_end in baseline_windows:
        window_pts = parse_power_series(
            raw,
            elevation_m=elevation_m,
            start_filter=b_start,
            end_filter=b_end,
        )
        if window_pts:
            baseline_points.extend(window_pts)
        else:
            missing_windows += 1

    if not recent_series:
        power_status = "unavailable"
    elif missing_windows > 0:
        power_status = "partial"
    else:
        power_status = "available"

    limitation_text = (
        "Grid-cell climate product (~55 km). Captures regional weather, solar radiation, "
        "and rainfall patterns well, but does not measure individual field irrigation or microclimate."
    )
    if missing_windows == len(baseline_windows) and recent_series:
        limitation_text += " 5-year historical baseline unavailable; anomaly metrics omitted."
    elif missing_windows > 0 and recent_series:
        limitation_text += f" Only {len(baseline_windows) - missing_windows} of {len(baseline_windows)} baseline years loaded."

    status = DataSourceStatus(
        id="nasa_power",
        name="NASA POWER Agroclimatology",
        provider="NASA Langley Research Center",
        category="modeled_estimate",
        status=power_status,
        spatial_resolution="0.5 x 0.625 deg (~55 km grid)",
        temporal_resolution="Daily (typically 3 to 5 day lag)",
        observation_window=(
            f"{recent_series[0].date} to {recent_series[-1].date}" if recent_series else None
        ),
        latest_date=recent_series[-1].date if recent_series else None,
        scene_count=len(recent_series),
        limitations=limitation_text,
    )
    return recent_series, baseline_points, status


async def get_power_observations_and_baseline(
    lat: float,
    lon: float,
    ref_date: date | None = None,
    elevation_m: float = DEFAULT_ELEVATION_M,
) -> tuple[list[DailyWeatherPoint], list[DailyWeatherPoint], DataSourceStatus]:
    """Fetch once and split recent + 5-year historical baseline NASA POWER series."""
    raw, anchor, err = await fetch_power_raw_bundle(lat, lon, ref_date=ref_date)
    return split_power_bundle(raw, anchor, elevation_m=elevation_m, error_message=err)
