"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Check,
  Crosshair,
  Layers,
  Pencil,
  RotateCcw,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/primitives";
import {
  OVERLAY_OPTIONS,
  resolveFieldOverlay,
  type OverlayMode,
} from "@/components/map/mapOverlays";
import {
  buildPolygonAroundPoint,
  cn,
  estimatePolygonArea,
  polygonCentroid,
} from "@/lib/utils";
import type { GeoJsonPolygon, SavedFieldRecord } from "@/types/rotara";

interface FarmMapCanvasProps {
  visible: boolean;
  records: SavedFieldRecord[];
  selectedRecord: SavedFieldRecord | null;
  onSelectField: (fieldId: string) => void;
  onFinishPolygon: (geometry: GeoJsonPolygon) => void;
  onOpenAdvice: () => void;
}

const PUNJAB_CENTER: [number, number] = [72.6, 31.1];
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Esri World Imagery",
    },
  },
  layers: [{ id: "satellite-base", type: "raster", source: "esri" }],
};

function closeRing(points: [number, number][]): GeoJsonPolygon {
  const ring = [...points, points[0]];
  return { type: "Polygon", coordinates: [ring] };
}

export function FarmMapCanvas({
  visible,
  records,
  selectedRecord,
  onSelectField,
  onFinishPolygon,
  onOpenAdvice,
}: FarmMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);

  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [overlay, setOverlay] = useState<OverlayMode>("outline");
  const [gpsError, setGpsError] = useState<string | null>(null);

  const drawModeRef = useRef(drawMode);
  const drawPointsRef = useRef(drawPoints);
  const onSelectRef = useRef(onSelectField);
  const onFinishRef = useRef(onFinishPolygon);

  useEffect(() => {
    drawModeRef.current = drawMode;
    drawPointsRef.current = drawPoints;
    onSelectRef.current = onSelectField;
    onFinishRef.current = onFinishPolygon;
  }, [drawMode, drawPoints, onSelectField, onFinishPolygon]);

  const overlayVisual = useMemo(
    () => resolveFieldOverlay(selectedRecord, overlay),
    [selectedRecord, overlay]
  );

  const syncSavedSources = useCallback(
    (map: maplibregl.Map) => {
      if (!mapReadyRef.current) return;

      const selectedId = selectedRecord?.field.id;
      const polygonsSrc = map.getSource("fields-poly") as maplibregl.GeoJSONSource | undefined;
      const pinsSrc = map.getSource("fields-pin") as maplibregl.GeoJSONSource | undefined;
      if (!polygonsSrc || !pinsSrc) return;

      polygonsSrc.setData({
        type: "FeatureCollection",
        features: records.map((r) => ({
          type: "Feature" as const,
          properties: {
            id: r.field.id,
            name: r.field.name,
            selected: r.field.id === selectedId ? 1 : 0,
          },
          geometry: r.field.geometry,
        })),
      });

      pinsSrc.setData({
        type: "FeatureCollection",
        features: records.map((r) => ({
          type: "Feature" as const,
          properties: {
            id: r.field.id,
            name: r.field.name,
            selected: r.field.id === selectedId ? 1 : 0,
          },
          geometry: { type: "Point" as const, coordinates: polygonCentroid(r.field.geometry) },
        })),
      });

      if (map.getLayer("fields-selected-fill")) {
        map.setPaintProperty("fields-selected-fill", "fill-color", overlayVisual.fillColor);
        map.setPaintProperty("fields-selected-fill", "fill-opacity", overlayVisual.fillOpacity);
      }
      if (map.getLayer("fields-selected-line")) {
        map.setPaintProperty("fields-selected-line", "line-color", overlayVisual.lineColor);
        map.setPaintProperty("fields-selected-line", "line-width", overlayVisual.lineWidth);
      }
    },
    [records, selectedRecord, overlayVisual]
  );

  const syncDrawSource = useCallback((map: maplibregl.Map) => {
    if (!mapReadyRef.current) return;
    const src = map.getSource("draw-sketch") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    const pts = drawPointsRef.current;
    const preview = hoverPoint && drawModeRef.current ? [...pts, hoverPoint] : pts;
    const features: Array<{
      type: "Feature";
      properties: Record<string, string>;
      geometry:
        | { type: "Polygon"; coordinates: number[][][] }
        | { type: "LineString"; coordinates: number[][] }
        | { type: "Point"; coordinates: number[] };
    }> = [];

    if (preview.length >= 3) {
      features.push({
        type: "Feature",
        properties: { kind: "poly" },
        geometry: closeRing(preview),
      });
    } else if (preview.length >= 2) {
      features.push({
        type: "Feature",
        properties: { kind: "line" },
        geometry: { type: "LineString", coordinates: preview },
      });
    }
    pts.forEach((pt, idx) => {
      features.push({
        type: "Feature",
        properties: { kind: idx === 0 ? "first" : "vertex" },
        geometry: { type: "Point", coordinates: pt },
      });
    });

    src.setData({ type: "FeatureCollection", features });
  }, [hoverPoint]);

  const zoomToRecord = useCallback((record: SavedFieldRecord) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const ring = record.field.geometry.coordinates[0] ?? [];
    if (ring.length < 3) return;
    const bounds = new maplibregl.LngLatBounds();
    ring.forEach((coord) => bounds.extend([coord[0], coord[1]]));
    map.fitBounds(bounds, {
      padding: { top: 88, bottom: 96, left: 64, right: 64 },
      maxZoom: 18,
      duration: 650,
    });
  }, []);

  const commitDrawing = useCallback(() => {
    const pts = drawPointsRef.current;
    if (pts.length < 3) return;
    const poly = closeRing(pts);
    setDrawMode(false);
    setDrawPoints([]);
    setHoverPoint(null);
    onFinishRef.current(poly);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = new maplibregl.Map({
      container: el,
      style: SATELLITE_STYLE,
      center: PUNJAB_CENTER,
      zoom: 6.8,
      maxZoom: 18,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    map.on("load", () => {
      mapReadyRef.current = true;
      map.addSource("fields-poly", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("fields-pin", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource("draw-sketch", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "fields-other-fill",
        type: "fill",
        source: "fields-poly",
        filter: ["==", ["get", "selected"], 0],
        paint: { "fill-color": "#FFFFFF", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "fields-other-line",
        type: "line",
        source: "fields-poly",
        filter: ["==", ["get", "selected"], 0],
        paint: { "line-color": "#E2E8F0", "line-width": 2 },
      });
      map.addLayer({
        id: "fields-selected-fill",
        type: "fill",
        source: "fields-poly",
        filter: ["==", ["get", "selected"], 1],
        paint: { "fill-color": "#FACC15", "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "fields-selected-line",
        type: "line",
        source: "fields-poly",
        filter: ["==", ["get", "selected"], 1],
        paint: { "line-color": "#FACC15", "line-width": 3.5 },
      });

      map.addLayer({
        id: "fields-pin-circle",
        type: "circle",
        source: "fields-pin",
        paint: {
          "circle-radius": ["case", ["==", ["get", "selected"], 1], 9, 6],
          "circle-color": ["case", ["==", ["get", "selected"], 1], "#FACC15", "#FFFFFF"],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#14532D",
        },
      });
      map.addLayer({
        id: "fields-pin-label",
        type: "symbol",
        source: "fields-pin",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#111827",
          "text-halo-width": 2,
        },
      });

      map.addLayer({
        id: "draw-poly",
        type: "fill",
        source: "draw-sketch",
        filter: ["==", ["get", "kind"], "poly"],
        paint: { "fill-color": "#FACC15", "fill-opacity": 0.26 },
      });
      map.addLayer({
        id: "draw-line",
        type: "line",
        source: "draw-sketch",
        filter: ["in", ["get", "kind"], ["literal", ["poly", "line"]]],
        paint: { "line-color": "#FACC15", "line-width": 3 },
      });
      map.addLayer({
        id: "draw-vertices",
        type: "circle",
        source: "draw-sketch",
        filter: ["in", ["get", "kind"], ["literal", ["first", "vertex"]]],
        paint: {
          "circle-radius": ["case", ["==", ["get", "kind"], "first"], 8, 6],
          "circle-color": ["case", ["==", ["get", "kind"], "first"], "#22C55E", "#FACC15"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FFFFFF",
        },
      });

      syncSavedSources(map);
      if (selectedRecord) zoomToRecord(selectedRecord);
    });

    map.on("click", (e: maplibregl.MapMouseEvent) => {
      if (drawModeRef.current) {
        const pts = drawPointsRef.current;
        if (pts.length >= 3) {
          const firstScreen = map.project(pts[0]);
          const distPx = Math.hypot(firstScreen.x - e.point.x, firstScreen.y - e.point.y);
          if (distPx <= 16) {
            commitDrawing();
            return;
          }
        }
        const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const prev = pts[pts.length - 1];
        if (prev && Math.hypot(prev[0] - coord[0], prev[1] - coord[1]) < 1e-6) return;
        setDrawPoints([...pts, coord]);
        return;
      }

      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["fields-other-fill", "fields-selected-fill", "fields-pin-circle"],
      });
      const id = hits[0]?.properties?.id;
      if (typeof id === "string") onSelectRef.current(id);
    });

    map.on("mousemove", (e: maplibregl.MapMouseEvent) => {
      if (drawModeRef.current && drawPointsRef.current.length > 0) {
        setHoverPoint([e.lngLat.lng, e.lngLat.lat]);
      }
    });

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Map initializes once; refs keep handlers fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawMode) {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }
    map.getCanvas().style.cursor = drawMode ? "crosshair" : "";
    syncDrawSource(map);
  }, [drawMode, drawPoints, hoverPoint, syncDrawSource]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) syncSavedSources(map);
  }, [syncSavedSources]);

  useEffect(() => {
    if (selectedRecord) zoomToRecord(selectedRecord);
  }, [selectedRecord, zoomToRecord]);

  useEffect(() => {
    if (!visible) return;
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => {
      map.resize();
      if (selectedRecord) zoomToRecord(selectedRecord);
    }, 60);
    return () => clearTimeout(t);
  }, [visible, selectedRecord, zoomToRecord]);

  const handleUseGps = () => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError("GPS is not available on this computer.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const poly = buildPolygonAroundPoint(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 16,
          duration: 650,
        });
        onFinishPolygon(poly);
      },
      () => setGpsError("Could not read location. Please draw the field corners on the map.")
    );
  };

  const selectedArea = useMemo(
    () => (selectedRecord ? estimatePolygonArea(selectedRecord.field.geometry) : null),
    [selectedRecord]
  );

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-900">
      <div ref={containerRef} className="h-full w-full" />

      {/* Top Controls */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white/95 p-2 shadow-md">
          {!drawMode ? (
            <>
              <Button
                variant="primary"
                onClick={() => {
                  setGpsError(null);
                  setDrawPoints([]);
                  setDrawMode(true);
                }}
              >
                <Pencil className="h-4 w-4" />
                Draw Field on Map
              </Button>
              <Button variant="outline" onClick={handleUseGps}>
                <Crosshair className="h-4 w-4" />
                Use My GPS Location
              </Button>
            </>
          ) : (
            <>
              <span className="px-2 text-sm font-semibold text-stone-900">
                Click corners ({drawPoints.length} added)
              </span>
              <Button
                variant="outline"
                disabled={drawPoints.length === 0}
                onClick={() => setDrawPoints((p) => p.slice(0, -1))}
              >
                <Undo2 className="h-4 w-4" />
                Undo corner
              </Button>
              <Button
                variant="outline"
                disabled={drawPoints.length === 0}
                onClick={() => setDrawPoints([])}
              >
                <RotateCcw className="h-4 w-4" />
                Start again
              </Button>
              <Button
                variant="primary"
                disabled={drawPoints.length < 3}
                onClick={commitDrawing}
              >
                <Check className="h-4 w-4" />
                Done
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setDrawMode(false);
                  setDrawPoints([]);
                  setHoverPoint(null);
                }}
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
        </div>

        {/* 3 Clear Layer Buttons */}
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-stone-200 bg-white/95 p-1.5 shadow-md">
          <Layers className="mx-1.5 h-4 w-4 text-stone-500" />
          {OVERLAY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setOverlay(opt.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                overlay === opt.id
                  ? "bg-emerald-700 text-white"
                  : "text-stone-700 hover:bg-stone-100"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions or GPS Error */}
      {(drawMode || gpsError) && (
        <div className="pointer-events-none absolute inset-x-4 top-20 flex justify-center">
          <div className="rounded-lg border border-stone-300 bg-white/95 px-4 py-2 text-sm font-medium text-stone-900 shadow">
            {gpsError ??
              "Click each corner of your field. Click the green first dot or press Done when finished."}
          </div>
        </div>
      )}

      {/* Selected Field Card + Overlay Legend */}
      {selectedRecord && !drawMode && (
        <div className="pointer-events-auto absolute bottom-4 left-4 flex max-w-md flex-col gap-2 rounded-xl border border-stone-200 bg-white/95 p-3.5 shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-base font-bold text-stone-900">
                {selectedRecord.field.name}
              </div>
              {selectedArea && (
                <div className="text-sm text-stone-600">
                  {selectedArea.acres.toFixed(1)} acres ({selectedArea.kanals.toFixed(0)} kanals)
                </div>
              )}
            </div>
            <Button variant="primary" onClick={onOpenAdvice}>
              <Sparkles className="h-4 w-4" />
              See Advice
            </Button>
          </div>

          <div className="flex items-center gap-2 border-t border-stone-100 pt-2 text-sm text-stone-700">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-sm border border-stone-400"
              style={{ backgroundColor: overlayVisual.fillColor }}
            />
            <span>{overlayVisual.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
