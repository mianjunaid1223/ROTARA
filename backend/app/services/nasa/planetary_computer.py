from __future__ import annotations

import asyncio
from datetime import date, timedelta
import hashlib
from typing import Any

import httpx
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.windows import Window, from_bounds
from shapely import transform as shapely_vec_transform
from shapely.geometry.base import BaseGeometry

from app.algorithms.terrain import classify_terrain_risk, compute_slope_statistics
from app.algorithms.vegetation import normalized_difference
from app.cache.store import cache_store
from app.config import settings
from app.models.schemas import DataSourceStatus, NdviPoint, TerrainIndicators
from app.services.nasa.power import _week_cache_tag

GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF,.vrt",
    "GDAL_HTTP_MULTIPLEX": "YES",
    "GDAL_HTTP_VERSION": "2",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "VSI_CACHE": "TRUE",
    "GDAL_HTTP_TIMEOUT": "8",
    "GDAL_HTTP_MAX_RETRY": "1",
    "GDAL_HTTP_RETRY_DELAY": "1",
}

LANDSAT_C2_SCALE = 0.0000275
LANDSAT_C2_OFFSET = -0.2
METERS_PER_DEGREE_LAT = 111_320.0
SENTINEL2_VALID_SCL = [4, 5, 6, 7]
OPTICAL_SEMAPHORE_LIMIT = 4
MAX_S2_SCENES = 3
MAX_L8_SCENES = 2
EMPTY_OPTICAL_CACHE_TTL_HOURS = 6.0


def _reproject_geom(geom: BaseGeometry, dst_crs: Any) -> BaseGeometry:
    transformer = Transformer.from_crs("EPSG:4326", dst_crs, always_xy=True)
    return shapely_vec_transform(
        geom,
        lambda coords: np.column_stack(transformer.transform(coords[:, 0], coords[:, 1])),
    )


def _geometry_cache_key(geom: BaseGeometry) -> str:
    return hashlib.sha256(geom.wkb).hexdigest()[:16]


def _aligned_window(bounds: tuple[float, float, float, float], src_transform: Any) -> Window:
    win = from_bounds(*bounds, src_transform).round_offsets().round_lengths()
    return Window(
        win.col_off,
        win.row_off,
        max(1, int(win.width)),
        max(1, int(win.height)),
    )


def _build_field_mask(
    proj_geom: BaseGeometry,
    out_shape: tuple[int, int],
    win_transform: Any,
) -> np.ndarray:
    mask = geometry_mask([proj_geom], out_shape=out_shape, transform=win_transform, invert=True)
    if not np.any(mask):
        mask = geometry_mask(
            [proj_geom],
            out_shape=out_shape,
            transform=win_transform,
            invert=True,
            all_touched=True,
        )
    return mask


def _read_projected_window(
    url: str,
    geom: BaseGeometry,
    pad_meters: float,
    out_shape: tuple[int, int] | None = None,
) -> tuple[np.ndarray, Any, BaseGeometry]:
    with rasterio.open(url) as src:
        proj_geom = _reproject_geom(geom, src.crs)
        minx, miny, maxx, maxy = proj_geom.bounds
        pad = (pad_meters / METERS_PER_DEGREE_LAT) if (src.crs and src.crs.is_geographic) else pad_meters
        win = _aligned_window((minx - pad, miny - pad, maxx + pad, maxy + pad), src.transform)
        arr = src.read(1, window=win, out_shape=out_shape, boundless=True).astype("float32")
        return arr, src.window_transform(win), proj_geom


async def _get_sas_token(client: httpx.AsyncClient, collection: str) -> str:
    resp = await client.get(f"{settings.pc_sas_url}/{collection}")
    resp.raise_for_status()
    return resp.json()["token"]


def _sign_href(href: str, token: str) -> str:
    sep = "&" if "?" in href else "?"
    return f"{href}{sep}{token}"


async def _search_stac_scenes(
    client: httpx.AsyncClient,
    collection: str,
    search_geom: dict[str, Any],
    start_str: str,
    end_str: str,
    max_cloud: int,
    limit: int,
) -> list[dict[str, Any]]:
    payload = {
        "collections": [collection],
        "intersects": search_geom,
        "datetime": f"{start_str}T00:00:00Z/{end_str}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lt": max_cloud}},
        "limit": limit,
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
    }
    resp = await client.post(f"{settings.pc_stac_url}/search", json=payload)
    resp.raise_for_status()
    return resp.json().get("features", [])


def _pick_clearest_scenes(features: list[dict[str, Any]], max_count: int) -> list[dict[str, Any]]:
    by_date: dict[str, dict[str, Any]] = {}
    for feat in features:
        dt = feat["properties"]["datetime"][:10]
        cloud = float(feat["properties"].get("eo:cloud_cover", 100.0))
        prev = by_date.get(dt)
        if prev is None or cloud < float(prev["properties"].get("eo:cloud_cover", 100.0)):
            by_date[dt] = feat
    ranked = sorted(by_date.values(), key=lambda f: float(f["properties"].get("eo:cloud_cover", 100.0)))
    return ranked[:max_count]


def _read_s2_scene_stats(
    geom: BaseGeometry,
    red_url: str,
    nir_url: str,
    swir_url: str | None,
    scl_url: str | None,
) -> tuple[float | None, float | None, float | None]:
    """Read windowed Sentinel-2 bands masked to the field polygon and compute NDVI, NDWI, and valid pixel share."""
    with rasterio.Env(**GDAL_ENV):
        red, red_transform, proj_geom = _read_projected_window(red_url, geom, pad_meters=30.0)
        nir, _, _ = _read_projected_window(nir_url, geom, pad_meters=30.0, out_shape=red.shape)
        field_mask = _build_field_mask(proj_geom, red.shape, red_transform)
        valid_mask = field_mask & (red > 0) & (nir > 0) & np.isfinite(red) & np.isfinite(nir)

        if scl_url:
            try:
                scl, _, _ = _read_projected_window(scl_url, geom, pad_meters=30.0, out_shape=red.shape)
                valid_mask &= np.isin(scl.astype("int32"), SENTINEL2_VALID_SCL)
            except Exception:
                return None, None, 0.0

        total_pixels = max(1, int(np.sum(field_mask)))
        valid_count = int(np.sum(valid_mask))
        if valid_count == 0:
            return None, None, 0.0

        r_vals = red[valid_mask]
        n_vals = nir[valid_mask]
        ndvi_mean = normalized_difference(n_vals, r_vals)
        if ndvi_mean is None:
            return None, None, 0.0

        ndwi_mean: float | None = None
        if swir_url:
            try:
                swir, _, _ = _read_projected_window(swir_url, geom, pad_meters=30.0, out_shape=red.shape)
                ndwi_mean = normalized_difference(n_vals, swir[valid_mask])
            except Exception:
                ndwi_mean = None

        return ndvi_mean, ndwi_mean, round(valid_count / total_pixels, 2)


def _read_landsat_scene_stats(geom: BaseGeometry, red_url: str, nir_url: str) -> float | None:
    """Read windowed Landsat C2 L2 red & nir08 bands masked to the field polygon."""
    with rasterio.Env(**GDAL_ENV):
        red, red_transform, proj_geom = _read_projected_window(red_url, geom, pad_meters=60.0)
        nir, _, _ = _read_projected_window(nir_url, geom, pad_meters=60.0, out_shape=red.shape)
        field_mask = _build_field_mask(proj_geom, red.shape, red_transform)

        r_sr = red * LANDSAT_C2_SCALE + LANDSAT_C2_OFFSET
        n_sr = nir * LANDSAT_C2_SCALE + LANDSAT_C2_OFFSET
        valid = field_mask & (red > 0) & (nir > 0) & (r_sr > 0) & (n_sr > 0)
        if not np.any(valid):
            return None
        return normalized_difference(n_sr[valid], r_sr[valid])


def _read_dem_terrain(geom: BaseGeometry, dem_url: str) -> tuple[float, float, float]:
    """Compute elevation (m), mean slope (%), and max slope (%) inside the field polygon from a 30m DEM COG."""
    with rasterio.Env(**GDAL_ENV):
        with rasterio.open(dem_url) as src:
            proj_geom = _reproject_geom(geom, src.crs)
            minx, miny, maxx, maxy = proj_geom.bounds
            pad = 0.0015 if (src.crs and src.crs.is_geographic) else 150.0
            win = _aligned_window((minx - pad, miny - pad, maxx + pad, maxy + pad), src.transform)
            elev = src.read(1, window=win, boundless=True).astype("float32")
            field_mask = _build_field_mask(proj_geom, elev.shape, src.window_transform(win))
            valid = field_mask & np.isfinite(elev) & (elev > -100) & (elev < 9000)
            if not np.any(valid):
                raise ValueError("No valid DEM elevation pixels in field polygon.")

            mean_elev = float(np.nanmean(elev[valid]))
            lat_rad = np.deg2rad(geom.centroid.y)
            dy_m = abs(src.transform.e) * METERS_PER_DEGREE_LAT
            dx_m = abs(src.transform.a) * METERS_PER_DEGREE_LAT * max(0.1, float(np.cos(lat_rad)))
            mean_slope, max_slope = compute_slope_statistics(elev, field_mask, dy_m, dx_m)
            return round(mean_elev, 1), mean_slope, max_slope


async def fetch_sentinel2_and_landsat(
    geom: BaseGeometry,
    ref_date: date | None = None,
) -> tuple[list[NdviPoint], DataSourceStatus, DataSourceStatus]:
    """Query Planetary Computer STAC for up to 3 clearest Sentinel-2 scenes concurrently; fallback to Landsat."""
    anchor = ref_date or date.today()
    start_str = (anchor - timedelta(days=150)).isoformat()
    end_str = anchor.isoformat()

    cache_params = {
        "geom_hash": _geometry_cache_key(geom),
        "week": _week_cache_tag(anchor),
    }
    cached = cache_store.get("pc_optical_ndvi", cache_params, ttl_hours=EMPTY_OPTICAL_CACHE_TTL_HOURS)
    if cached is not None and (cached.get("points") or cached.get("empty_ok")):
        points = [NdviPoint(**p) for p in cached["points"]]
        return points, DataSourceStatus(**cached["s2_status"]), DataSourceStatus(**cached["l8_status"])
    if cached is not None and cached.get("points"):
        points = [NdviPoint(**p) for p in cached["points"]]
        return points, DataSourceStatus(**cached["s2_status"]), DataSourceStatus(**cached["l8_status"])

    points: list[NdviPoint] = []
    s2_dates: list[str] = []
    l8_dates: list[str] = []
    s2_error: str | None = None
    l8_error: str | None = None
    l8_skipped = False

    centroid = geom.centroid
    search_geom = {"type": "Point", "coordinates": [round(centroid.x, 6), round(centroid.y, 6)]}
    sem = asyncio.Semaphore(OPTICAL_SEMAPHORE_LIMIT)

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. Sentinel-2 L2A (prefer <15% cloud, fallback <30%)
        try:
            s2_features = await _search_stac_scenes(client, "sentinel-2-l2a", search_geom, start_str, end_str, 15, 8)
            if len(s2_features) < 2:
                s2_features = await _search_stac_scenes(client, "sentinel-2-l2a", search_geom, start_str, end_str, 30, 8)
            chosen_s2 = _pick_clearest_scenes(s2_features, MAX_S2_SCENES)
            if chosen_s2:
                token = await _get_sas_token(client, "sentinel-2-l2a")

                async def _read_s2(feat: dict[str, Any]) -> NdviPoint | None:
                    assets = feat.get("assets", {})
                    if "B04" not in assets or "B08" not in assets:
                        return None
                    async with sem:
                        ndvi_val, ndwi_val, _ = await asyncio.to_thread(
                            _read_s2_scene_stats,
                            geom,
                            _sign_href(assets["B04"]["href"], token),
                            _sign_href(assets["B08"]["href"], token),
                            _sign_href(assets["B11"]["href"], token) if "B11" in assets else None,
                            _sign_href(assets["SCL"]["href"], token) if "SCL" in assets else None,
                        )
                    if ndvi_val is None:
                        return None
                    return NdviPoint(
                        date=feat["properties"]["datetime"][:10],
                        ndvi_mean=ndvi_val,
                        ndwi_mean=ndwi_val,
                        cloud_cover_pct=feat["properties"].get("eo:cloud_cover"),
                        sensor="Sentinel-2 L2A",
                        resolution_m=10,
                    )

                s2_results = await asyncio.gather(*[_read_s2(f) for f in chosen_s2])
                for pt in s2_results:
                    if pt is not None:
                        points.append(pt)
                        s2_dates.append(pt.date)
        except Exception as exc:
            s2_error = str(exc)

        # 2. Landsat fallback only when fewer than 2 valid Sentinel-2 scenes exist
        if len(s2_dates) >= 2:
            l8_skipped = True
        else:
            try:
                l8_features = await _search_stac_scenes(client, "landsat-c2-l2", search_geom, start_str, end_str, 30, 6)
                chosen_l8 = _pick_clearest_scenes(l8_features, MAX_L8_SCENES)
                if chosen_l8:
                    l8_token = await _get_sas_token(client, "landsat-c2-l2")

                    async def _read_l8(feat: dict[str, Any]) -> NdviPoint | None:
                        assets = feat.get("assets", {})
                        if "red" not in assets or "nir08" not in assets:
                            return None
                        async with sem:
                            ndvi_val = await asyncio.to_thread(
                                _read_landsat_scene_stats,
                                geom,
                                _sign_href(assets["red"]["href"], l8_token),
                                _sign_href(assets["nir08"]["href"], l8_token),
                            )
                        if ndvi_val is None:
                            return None
                        return NdviPoint(
                            date=feat["properties"]["datetime"][:10],
                            ndvi_mean=ndvi_val,
                            ndwi_mean=None,
                            cloud_cover_pct=feat["properties"].get("eo:cloud_cover"),
                            sensor="Landsat C2 L2",
                            resolution_m=30,
                        )

                    l8_results = await asyncio.gather(*[_read_l8(f) for f in chosen_l8])
                    for pt in l8_results:
                        if pt is not None:
                            points.append(pt)
                            l8_dates.append(pt.date)
            except Exception as exc:
                l8_error = str(exc)

    points.sort(key=lambda p: p.date)
    s2_dates.sort()
    l8_dates.sort()

    s2_status = DataSourceStatus(
        id="sentinel2",
        name="ESA Copernicus Sentinel-2 L2A",
        provider="ESA / Planetary Computer STAC",
        category="direct_observation",
        status="available" if s2_dates else "unavailable",
        spatial_resolution="10 m (NDVI) / 20 m (NDWI & cloud mask)",
        temporal_resolution="5-day revisit (clearest <=3 scenes <15-30% cloud)",
        observation_window=f"{s2_dates[0]} to {s2_dates[-1]}" if s2_dates else None,
        latest_date=s2_dates[-1] if s2_dates else None,
        scene_count=len(s2_dates),
        limitations=(
            "Optical sensor blocked by heavy clouds or haze. NDVI measures canopy greenness, not soil nutrients."
            if not s2_error
            else f"Sentinel-2 query unavailable: {s2_error}"
        ),
    )

    if l8_skipped:
        l8_limitation = "Skipped: >= 2 clear Sentinel-2 scenes already retrieved."
    elif l8_error:
        l8_limitation = f"Landsat query unavailable: {l8_error}"
    else:
        l8_limitation = "30 m pixel resolution averages small boundary plots; optical imagery is affected by cloud cover."

    l8_status = DataSourceStatus(
        id="landsat",
        name="NASA/USGS Landsat Collection 2 L2",
        provider="USGS & NASA / Planetary Computer STAC",
        category="direct_observation",
        status="available" if l8_dates else "unavailable",
        spatial_resolution="30 m multispectral",
        temporal_resolution="8-16 day revisit (fallback when <2 Sentinel-2 scenes)",
        observation_window=f"{l8_dates[0]} to {l8_dates[-1]}" if l8_dates else None,
        latest_date=l8_dates[-1] if l8_dates else None,
        scene_count=len(l8_dates),
        limitations=l8_limitation,
    )

    cache_store.set(
        "pc_optical_ndvi",
        cache_params,
        {
            "points": [p.model_dump() for p in points],
            "s2_status": s2_status.model_dump(),
            "l8_status": l8_status.model_dump(),
            "empty_ok": not bool(points),
        },
    )

    return points, s2_status, l8_status


async def fetch_terrain_dem(geom: BaseGeometry) -> tuple[TerrainIndicators, DataSourceStatus]:
    """Retrieve 30m DEM (NASADEM / Copernicus GLO-30) for elevation and terrain slope."""
    centroid = geom.centroid
    cache_params = {"geom_hash": _geometry_cache_key(geom)}
    cached = cache_store.get("pc_dem", cache_params)
    if cached is not None:
        return TerrainIndicators(**cached["terrain"]), DataSourceStatus(**cached["status"])

    search_geom = {"type": "Point", "coordinates": [round(centroid.x, 6), round(centroid.y, 6)]}
    last_error: str = "No DEM tile matched the field location."
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            for collection, label in [
                ("nasadem", "NASA SRTM / NASADEM 30m"),
                ("cop-dem-glo-30", "Copernicus DEM GLO-30"),
            ]:
                try:
                    resp = await client.post(
                        f"{settings.pc_stac_url}/search",
                        json={"collections": [collection], "intersects": search_geom, "limit": 1},
                    )
                    resp.raise_for_status()
                    feats = resp.json().get("features", [])
                    if not feats:
                        continue
                    assets = feats[0].get("assets", {})
                    asset_key = "elevation" if "elevation" in assets else ("data" if "data" in assets else None)
                    if not asset_key:
                        continue
                    token = await _get_sas_token(client, collection)
                    dem_url = _sign_href(assets[asset_key]["href"], token)
                    elev_m, mean_slope, max_slope = await asyncio.to_thread(_read_dem_terrain, geom, dem_url)
                    runoff, erosion = classify_terrain_risk(mean_slope)

                    terrain = TerrainIndicators(
                        elevation_m=elev_m,
                        slope_mean_pct=mean_slope,
                        slope_max_pct=max_slope,
                        runoff_susceptibility=runoff,
                        erosion_risk=erosion,
                        farmer_summary=(
                            f"Your field is relatively flat ({mean_slope:.1f}% slope at {elev_m:.0f} m elevation), "
                            "so rainwater stays in place well."
                            if runoff == "low"
                            else f"Your field has noticeable slope ({mean_slope:.1f}% average), so heavy rain can wash away topsoil unless cover crops or contour ridges are used."
                        ),
                        agronomist_summary=(
                            f"30m DEM reports mean elevation {elev_m:.1f} m, mean slope {mean_slope:.2f}% "
                            f"(95th pct {max_slope:.2f}%). Terrain runoff/erosion susceptibility: {runoff}."
                        ),
                    )
                    status = DataSourceStatus(
                        id="srtm_dem",
                        name=label,
                        provider="NASA / Planetary Computer STAC",
                        category="direct_observation",
                        status="available",
                        spatial_resolution="30 m",
                        temporal_resolution="Static topographic baseline",
                        latest_date="2000-2020 baseline",
                        scene_count=1,
                        limitations="30 m elevation grid shows terrain-related erosion susceptibility, not micro-level field bunds or laser-leveled grading.",
                    )
                    cache_store.set(
                        "pc_dem",
                        cache_params,
                        {"terrain": terrain.model_dump(), "status": status.model_dump()},
                    )
                    return terrain, status
                except Exception as coll_exc:
                    last_error = f"{collection}: {coll_exc}"
                    continue

        raise RuntimeError(last_error)
    except Exception as exc:
        terrain = TerrainIndicators(
            elevation_m=None,
            slope_mean_pct=None,
            slope_max_pct=None,
            runoff_susceptibility="unknown",
            erosion_risk="unknown",
            farmer_summary="Terrain elevation and slope data could not be loaded for this location right now.",
            agronomist_summary=f"DEM retrieval unavailable: {exc}",
        )
        status = DataSourceStatus(
            id="srtm_dem",
            name="NASA SRTM / NASADEM 30m",
            provider="NASA / Planetary Computer STAC",
            category="direct_observation",
            status="unavailable",
            spatial_resolution="30 m",
            temporal_resolution="Static topographic baseline",
            limitations=f"DEM query failed: {exc}",
        )
        return terrain, status
