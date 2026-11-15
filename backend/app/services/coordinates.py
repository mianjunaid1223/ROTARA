"""Small, dependency-light helpers for field coordinate input."""

from __future__ import annotations

from typing import Any

from shapely.geometry import Polygon


def validate_coordinate(lat: float, lon: float) -> tuple[float, float]:
    """Return a normalized latitude/longitude pair or raise ``ValueError``."""
    if not (-90 <= lat <= 90):
        raise ValueError("latitude must be between -90 and 90 degrees")
    if not (-180 <= lon <= 180):
        raise ValueError("longitude must be between -180 and 180 degrees")
    return float(lat), float(lon)


def polygon_from_coordinates(coordinates: list[tuple[float, float]]) -> dict[str, Any]:
    """Create a closed GeoJSON polygon from ``(longitude, latitude)`` pairs."""
    if len(coordinates) < 3:
        raise ValueError("at least three coordinates are required")
    points = [validate_coordinate(lat, lon) for lon, lat in coordinates]
    ring = [(lon, lat) for lat, lon in points]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    polygon = Polygon(ring)
    if polygon.is_empty or polygon.area == 0:
        raise ValueError("coordinates must form a non-zero area polygon")
    if not polygon.is_valid:
        raise ValueError("coordinates must form a valid, non-self-intersecting polygon")
    return {"type": "Polygon", "coordinates": [[list(point) for point in ring]]}


def validate_geojson_polygon(geometry: dict[str, Any]) -> dict[str, Any]:
    """Validate a GeoJSON Polygon/Feature and return its geometry mapping."""
    from app.services.geo import extract_polygon

    extract_polygon(geometry)
    return geometry.get("geometry", geometry)
