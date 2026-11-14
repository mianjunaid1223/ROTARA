from __future__ import annotations

from typing import Any
from pyproj import Geod
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import orient

from app.config import settings
from app.models.schemas import AreaResponse

GEOD = Geod(ellps="WGS84")

SQM_PER_HECTARE = 10_000.0
SQM_PER_ACRE = 4_046.8564224
KANALS_PER_ACRE = 8.0


def extract_polygon(geojson_obj: dict[str, Any]) -> Polygon | MultiPolygon:
    """Extract a valid Shapely polygon from a GeoJSON Feature or Geometry."""
    geom_dict = geojson_obj.get("geometry", geojson_obj)
    geom = shape(geom_dict)
    if not geom.is_valid:
        geom = geom.buffer(0)
    if not isinstance(geom, (Polygon, MultiPolygon)):
        raise ValueError("Field boundary must be a Polygon or MultiPolygon GeoJSON.")
    if geom.is_empty:
        raise ValueError("Field boundary geometry is empty.")
    return geom


def classify_punjab_agro_zone(lat: float, lon: float) -> tuple[str, str, str]:
    """
    Classify coordinates into one of Punjab, Pakistan's major agro-ecological zones
    based on provincial latitude/longitude envelopes.
    """
    if lat >= 32.5:
        return (
            "barani_potohar",
            "Potohar & Northern Rainfed (Barani) Zone",
            "Sloping rainfed and limited-irrigation belt (Chakwal, Rawalpindi, Attock, Jhelum). Moisture conservation and drought-tolerant legumes matter strongly here.",
        )
    if lat >= 31.1 and lon >= 73.2:
        return (
            "rice_wheat",
            "Punjab Rice-Wheat Belt",
            "Irrigated northeastern and central plains (Gujranwala, Sheikhupura, Sialkot, Narowal, Hafizabad). Intensive paddy-wheat cycles risk hardpan formation and groundwater depletion.",
        )
    if lat < 30.8 and lon >= 71.0:
        return (
            "cotton_wheat",
            "Southern Punjab Cotton-Wheat Zone",
            "Hot, arid to semi-arid southern plains (Multan, Bahawalpur, Lodhran, Vehari, Rahim Yar Khan). High summer heat stress makes heat tolerance and canal/tubewell timing critical.",
        )
    if lon < 72.1 and 30.3 <= lat < 32.5:
        return (
            "thal_sandy",
            "Thal & Western Sandy Plains",
            "Light-textured, faster-draining soils (Bhakkar, Layyah, Khushab, Mianwali). Well suited to chickpea, mung bean, and water-efficient rotations.",
        )
    return (
        "central_mixed",
        "Central Punjab Mixed Cropping Zone",
        "Canal-irrigated central plains (Faisalabad, Sargodha, Sahiwal, Toba Tek Singh, Okara) supporting maize, wheat, sugarcane, potato, and legume catch crops.",
    )


def _normalize_orientation(geom: Polygon | MultiPolygon) -> Polygon | MultiPolygon:
    """Orient exterior rings counter-clockwise and interior holes clockwise."""
    if isinstance(geom, Polygon):
        return orient(geom, sign=1.0)
    return MultiPolygon([orient(part, sign=1.0) for part in geom.geoms])


def analyze_field_geometry(geojson_obj: dict[str, Any]) -> AreaResponse:
    geom = _normalize_orientation(extract_polygon(geojson_obj))
    area_m2, perimeter_m = GEOD.geometry_area_perimeter(geom)
    area_m2 = abs(area_m2)

    centroid = geom.centroid
    centroid_lon = float(centroid.x)
    centroid_lat = float(centroid.y)
    minx, miny, maxx, maxy = geom.bounds

    in_punjab = (
        settings.punjab_min_lat <= centroid_lat <= settings.punjab_max_lat
        and settings.punjab_min_lon <= centroid_lon <= settings.punjab_max_lon
    )

    zone_id, zone_name, zone_note = classify_punjab_agro_zone(centroid_lat, centroid_lon)
    if not in_punjab:
        zone_note = (
            "This field lies outside Punjab, Pakistan. Punjab crop rules are still shown for reference, "
            "but local suitability should be verified with regional extension advice."
        )

    area_ha = area_m2 / SQM_PER_HECTARE
    area_acres = area_m2 / SQM_PER_ACRE
    area_kanals = area_acres * KANALS_PER_ACRE

    return AreaResponse(
        area_hectares=round(area_ha, 3),
        area_acres=round(area_acres, 3),
        area_kanals=round(area_kanals, 2),
        perimeter_meters=round(abs(perimeter_m), 1),
        centroid_lat=round(centroid_lat, 6),
        centroid_lon=round(centroid_lon, 6),
        bbox=[round(minx, 6), round(miny, 6), round(maxx, 6), round(maxy, 6)],
        in_punjab=in_punjab,
        agro_zone_id=zone_id,
        agro_zone_name=zone_name,
        agro_zone_note=zone_note,
    )
