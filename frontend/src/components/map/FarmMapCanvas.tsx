"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FolderKanban,
  Mountain,
  Pencil,
  Plus,
  RotateCcw,
  Satellite,
  Sprout,
  Trash2,
  Undo2,
  X,
} from "@/components/ui/icons";
import { CropImage } from "@/components/ui/CropImage";
import { Button } from "@/components/ui/primitives";
import { resolveFieldOverlay } from "@/components/map/mapOverlays";
import {
  buildPolygonAroundPoint,
  cn,
  estimatePolygonArea,
  formatCropLabel,
  polygonCentroid,
} from "@/lib/utils";
import { getMapProvider, MAP_PROVIDERS, type MapProviderId } from "@/components/map/mapProviders";
import type { GeoJsonPolygon, SavedFieldRecord } from "@/types/rotara";

if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(
    new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString()
  );
}

interface FarmMapCanvasProps {
  visible: boolean;
  compact?: boolean;
  records: SavedFieldRecord[];
  selectedRecord: SavedFieldRecord | null;
  draftGeometry?: GeoJsonPolygon | null;
  externalDrawTrigger?: number;
  onSelectField: (fieldId: string) => void;
  onFinishPolygon: (geometry: GeoJsonPolygon) => void;
  onStartNewField?: () => void;
  onDeleteField?: (fieldId: string) => void;
  onResetDraft?: () => void;
  onOpenAdvice?: () => void;
  onOpenExpert?: () => void;
  onEditSelectedField?: () => void;
}

const PUNJAB_CENTER: [number, number] = [72.85, 31.25];
const DEFAULT_PUNJAB_ZOOM = 6.9;
const MAX_MAP_ZOOM = 21;
const FIT_BOUNDS_MAX_ZOOM = 19;

function buildMapStyle(providerId: MapProviderId): maplibregl.StyleSpecification {
  const provider = getMapProvider(providerId);
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: provider.tiles,
        tileSize: 256,
        maxzoom: 19,
        attribution: provider.attribution,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

function closeRing(points: [number, number][]): GeoJsonPolygon {
  const ring = [...points, points[0]];
  return { type: "Polygon", coordinates: [ring] };
}

function deduplicateTrailingPoints(pts: [number, number][]): [number, number][] {
  if (pts.length < 2) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const cur = pts[i];
    if (Math.hypot(prev[0] - cur[0], prev[1] - cur[1]) > 1e-6) {
      out.push(cur);
    }
  }
  return out;
}

export function FarmMapCanvas({
  visible,
  compact = false,
  records,
  selectedRecord,
  draftGeometry = null,
  externalDrawTrigger = 0,
  onSelectField,
  onFinishPolygon,
  onStartNewField,
  onDeleteField,
  onResetDraft,
  onOpenAdvice,
  onOpenExpert,
  onEditSelectedField,
}: FarmMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);

  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [hoverPoint, setHoverPoint] = useState<[number, number] | null>(null);
  const [providerId, setProviderId] = useState<"satellite" | "terrain">("satellite");
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const startDrawingNewField = useCallback(() => {
    setGpsError(null);
    onStartNewField?.();
    setDrawPoints([]);
    setHoverPoint(null);
    setDrawMode(true);
  }, [onStartNewField]);

  const startRedrawBoundary = useCallback(() => {
    setGpsError(null);
    setDrawPoints([]);
    setHoverPoint(null);
    setDrawMode(true);
  }, []);

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

  useEffect(() => {
    if (externalDrawTrigger > 0) {
      setGpsError(null);
      setDrawPoints([]);
      setHoverPoint(null);
      setDrawMode(true);
    }
  }, [externalDrawTrigger]);

  const commitDrawing = useCallback((customPts?: [number, number][]) => {
    const pts = deduplicateTrailingPoints(customPts ?? drawPointsRef.current);
    if (pts.length < 3) {
      setDrawMode(false);
      setDrawPoints([]);
      setHoverPoint(null);
      return;
    }
    const poly = closeRing(pts);
    setDrawMode(false);
    setDrawPoints([]);
    setHoverPoint(null);
    onFinishRef.current(poly);
  }, []);

  const cancelDrawing = useCallback(() => {
    setDrawMode(false);
    setDrawPoints([]);
    setHoverPoint(null);
  }, []);

  useEffect(() => {
    if (!drawMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelDrawing();
      } else if (e.key === "Enter" && drawPointsRef.current.length >= 3) {
        commitDrawing();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawMode, cancelDrawing, commitDrawing]);

  const syncSavedSources = useCallback(
    (map: maplibregl.Map) => {
      if (!mapReadyRef.current) return;

      const selectedId = selectedRecord?.field.id;
      const polygonsSrc = map.getSource("fields-poly") as maplibregl.GeoJSONSource | undefined;
      const pinsSrc = map.getSource("fields-pin") as maplibregl.GeoJSONSource | undefined;
      const draftSrc = map.getSource("draft-poly") as maplibregl.GeoJSONSource | undefined;
      if (!polygonsSrc || !pinsSrc) return;

      polygonsSrc.setData({
        type: "FeatureCollection",
        features: records.map((r) => ({
          type: "Feature" as const,
          properties: {
            id: r.field.id,
            name: r.field.name,
            selected: r.field.id === selectedId ? 1 : 0,
            overlayFill: resolveFieldOverlay(r).fillColor,
            overlayOpacity: resolveFieldOverlay(r).fillOpacity,
            overlayLine: resolveFieldOverlay(r).lineColor,
            overlayLineWidth: resolveFieldOverlay(r).lineWidth,
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

      if (draftSrc) {
        draftSrc.setData({
          type: "FeatureCollection",
          features: draftGeometry
            ? [
                {
                  type: "Feature" as const,
                  properties: {},
                  geometry: draftGeometry,
                },
              ]
            : [],
        });
      }
    },
    [records, selectedRecord, draftGeometry]
  );

  const syncDrawSource = useCallback(
    (map: maplibregl.Map) => {
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
    },
    [hoverPoint]
  );

  const zoomToPolygon = useCallback(
    (poly: GeoJsonPolygon) => {
      const map = mapRef.current;
      if (!map || !mapReadyRef.current) return;
      const ring = poly.coordinates[0] ?? [];
      if (ring.length < 3) return;
      const bounds = new maplibregl.LngLatBounds();
      ring.forEach((coord) => bounds.extend([coord[0], coord[1]]));
      map.fitBounds(bounds, {
        padding: compact
          ? { top: 72, bottom: 72, left: 48, right: 48 }
          : { top: 96, bottom: 112, left: 72, right: 72 },
        maxZoom: FIT_BOUNDS_MAX_ZOOM,
        duration: 550,
      });
    },
    [compact]
  );

  const resetMapView = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    if (drawModeRef.current) {
      setDrawPoints([]);
      setHoverPoint(null);
      return;
    }
    if (draftGeometry) {
      onResetDraft?.();
    }
    if (selectedRecord) {
      zoomToPolygon(selectedRecord.field.geometry);
    } else {
      map.flyTo({ center: PUNJAB_CENTER, zoom: DEFAULT_PUNJAB_ZOOM, duration: 550 });
    }
  }, [draftGeometry, onResetDraft, selectedRecord, zoomToPolygon]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = new maplibregl.Map({
      container: el,
      style: buildMapStyle(providerId),
      center: PUNJAB_CENTER,
      zoom: DEFAULT_PUNJAB_ZOOM,
      maxZoom: MAX_MAP_ZOOM,
      minZoom: 4,
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
      map.addSource("draft-poly", {
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
        paint: {
          "fill-color": ["get", "overlayFill"],
          "fill-opacity": ["get", "overlayOpacity"],
        },
      });
      map.addLayer({
        id: "fields-other-line",
        type: "line",
        source: "fields-poly",
        filter: ["==", ["get", "selected"], 0],
        paint: {
          "line-color": ["get", "overlayLine"],
          "line-width": ["get", "overlayLineWidth"],
        },
      });
      map.addLayer({
        id: "fields-selected-fill",
        type: "fill",
        source: "fields-poly",
        filter: ["==", ["get", "selected"], 1],
        paint: {
          "fill-color": ["get", "overlayFill"],
          "fill-opacity": ["get", "overlayOpacity"],
        },
      });
      map.addLayer({
        id: "fields-selected-line",
        type: "line",
        source: "fields-poly",
        filter: ["==", ["get", "selected"], 1],
        paint: {
          "line-color": ["get", "overlayLine"],
          "line-width": ["get", "overlayLineWidth"],
        },
      });

      map.addLayer({
        id: "draft-poly-fill",
        type: "fill",
        source: "draft-poly",
        paint: {
          "fill-color": "#22C55E",
          "fill-opacity": 0.26,
        },
      });
      map.addLayer({
        id: "draft-poly-line",
        type: "line",
        source: "draft-poly",
        paint: {
          "line-color": "#FFFFFF",
          "line-width": 3,
          "line-dasharray": [2, 1.5],
        },
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
        paint: { "fill-color": "#22C55E", "fill-opacity": 0.28 },
      });
      map.addLayer({
        id: "draw-line",
        type: "line",
        source: "draw-sketch",
        filter: ["==", ["get", "kind"], "line"],
        paint: { "line-color": "#FFFFFF", "line-width": 3.5, "line-opacity": 0.98 },
      });
      map.addLayer({
        id: "draw-poly-line",
        type: "line",
        source: "draw-sketch",
        filter: ["==", ["get", "kind"], "poly"],
        paint: { "line-color": "#FFFFFF", "line-width": 3.5, "line-opacity": 0.98 },
      });
      map.addLayer({
        id: "draw-vertices",
        type: "circle",
        source: "draw-sketch",
        filter: [
          "any",
          ["==", ["get", "kind"], "first"],
          ["==", ["get", "kind"], "vertex"],
        ],
        paint: {
          "circle-radius": ["case", ["==", ["get", "kind"], "first"], 9, 6.5],
          "circle-color": ["case", ["==", ["get", "kind"], "first"], "#FACC15", "#1F5E36"],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#FFFFFF",
        },
      });

      syncSavedSources(map);
      if (draftGeometry) {
        zoomToPolygon(draftGeometry);
      } else if (selectedRecord) {
        zoomToPolygon(selectedRecord.field.geometry);
      }
    });

    map.on("click", (e: maplibregl.MapMouseEvent) => {
      if (drawModeRef.current) {
        const pts = drawPointsRef.current;
        if (pts.length >= 3) {
          const firstScreen = map.project(pts[0]);
          const distPx = Math.hypot(firstScreen.x - e.point.x, firstScreen.y - e.point.y);
          if (distPx <= 16) {
            commitDrawing(pts);
            return;
          }
        }
        const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const prev = pts[pts.length - 1];
        if (prev) {
          const prevScreen = map.project(prev);
          if (Math.hypot(prevScreen.x - e.point.x, prevScreen.y - e.point.y) <= 6) {
            return;
          }
        }
        const nextPts = [...pts, coord];
        drawPointsRef.current = nextPts;
        setDrawPoints(nextPts);
        return;
      }

      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["fields-other-fill", "fields-selected-fill", "fields-pin-circle"],
      });
      const id = hits[0]?.properties?.id;
      if (typeof id === "string") onSelectRef.current(id);
    });

    map.on("dblclick", (e: maplibregl.MapMouseEvent) => {
      if (!drawModeRef.current) return;
      e.preventDefault();
      const pts = deduplicateTrailingPoints(drawPointsRef.current);
      if (pts.length >= 3) {
        commitDrawing(pts);
      } else {
        cancelDrawing();
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const source = map.getSource("basemap") as maplibregl.RasterTileSource | undefined;
    if (!source) return;
    source.setTiles(getMapProvider(providerId).tiles);
  }, [providerId]);

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
    if (draftGeometry) {
      zoomToPolygon(draftGeometry);
    } else if (selectedRecord) {
      zoomToPolygon(selectedRecord.field.geometry);
    }
  }, [draftGeometry, selectedRecord, zoomToPolygon]);

  useEffect(() => {
    if (!visible) return;
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => {
      map.resize();
      if (draftGeometry) {
        zoomToPolygon(draftGeometry);
      } else if (selectedRecord) {
        zoomToPolygon(selectedRecord.field.geometry);
      }
    }, 60);
    return () => clearTimeout(t);
  }, [visible, compact, draftGeometry, selectedRecord, zoomToPolygon]);

  const handleUseGps = () => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError("GPS is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const poly = buildPolygonAroundPoint(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 17.5,
          duration: 600,
        });
        onFinishPolygon(poly);
      },
      () => setGpsError("Could not read GPS location. Draw the field corners on the map instead.")
    );
  };

  const activeArea = selectedRecord
    ? estimatePolygonArea(selectedRecord.field.geometry)
    : null;

  return (
    <div
      className={cn(
        "rotara-map-layer relative h-full w-full overflow-hidden bg-[#141E16]",
        !visible && "hidden"
      )}
      aria-hidden={!visible}
    >
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Right Basemap Switcher & Reset Camera */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 flex items-center gap-2">
        <div
          className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-[#D5D3C8] bg-white p-1 shadow-md"
          role="group"
          aria-label="Map view mode"
        >
          {MAP_PROVIDERS.map((provider) => {
            const active = providerId === provider.id;
            const Icon = provider.id === "satellite" ? Satellite : Mountain;
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => setProviderId(provider.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-[#1F5E36] text-white"
                    : "text-[#38473B] hover:bg-[#F4F3EE] hover:text-[#141E16]"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{provider.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={resetMapView}
          title="Reset map view"
          className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#D5D3C8] bg-white px-3 text-[12px] font-medium text-[#141E16] shadow-md hover:bg-[#F8F7F3] cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Top-Left: Active Drawing Controls OR Compact Toolbar */}
      {(drawMode || compact) && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col items-start gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-[#D5D3C8] bg-white p-1.5 shadow-md">
            {drawMode ? (
              <>
                <span className="px-2 text-[12px] font-semibold text-[#141E16] tabular-nums">
                  {drawPoints.length} {drawPoints.length === 1 ? "corner" : "corners"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={drawPoints.length === 0}
                  onClick={() => setDrawPoints((p) => p.slice(0, -1))}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Undo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={drawPoints.length === 0}
                  onClick={() => {
                    setDrawPoints([]);
                    setHoverPoint(null);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={drawPoints.length < 3}
                  onClick={() => commitDrawing()}
                >
                  <Check className="h-3.5 w-3.5" />
                  Finish
                </Button>
                <Button variant="danger" size="sm" onClick={cancelDrawing}>
                  <X className="h-3.5 w-3.5" />
                  Exit
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" size="sm" onClick={startRedrawBoundary}>
                  <Pencil className="h-3.5 w-3.5" />
                  {draftGeometry ? "Redraw Boundary" : "Draw Boundary"}
                </Button>
                <Button variant="outline" size="sm" onClick={startDrawingNewField}>
                  <Plus className="h-3.5 w-3.5" />
                  New Field
                </Button>
                <Button variant="outline" size="sm" onClick={handleUseGps}>
                  <Crosshair className="h-3.5 w-3.5" />
                  GPS
                </Button>
              </>
            )}
          </div>

          {drawMode && (
            <div className="pointer-events-auto rounded-lg border border-[#D5D3C8] bg-white/95 px-3 py-1.5 text-[12px] text-[#38473B] shadow-sm">
              Click map corners. Double-click to finish (or exit if &lt; 3 corners).
            </div>
          )}
        </div>
      )}

      {/* GPS Error Toast */}
      {gpsError && (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[#E8B8B4] bg-[#FBEAE8] px-3.5 py-2 text-[12px] font-medium text-[#8C261E] shadow-md">
            <span>{gpsError}</span>
            <button
              type="button"
              onClick={() => setGpsError(null)}
              className="rounded p-0.5 hover:bg-[#F5D5D1]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Unified Left Map Dock (Main Map Page Only, when not drawing) */}
      {!compact && !drawMode && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex max-h-[calc(100%-2rem)] items-start">
          {panelCollapsed ? (
            <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-[#D5D3C8] bg-white p-1.5 shadow-md">
              <button
                type="button"
                onClick={() => setPanelCollapsed(false)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-[#141E16] hover:bg-[#F8F7F3] cursor-pointer"
              >
                <FolderKanban className="h-4 w-4 text-[#1F5E36]" />
                <span>Fields ({records.length})</span>
                <ChevronRight className="h-3.5 w-3.5 text-[#5A6B5D]" />
              </button>
              <Button variant="primary" size="sm" onClick={startDrawingNewField}>
                <Plus className="h-3.5 w-3.5" />
                New Field
              </Button>
            </div>
          ) : (
            <div className="pointer-events-auto flex max-h-[calc(100dvh-6.5rem)] w-[336px] flex-col overflow-hidden rounded-xl border border-[#D5D3C8] bg-white shadow-lg">
              {/* Single Clean Header Bar */}
              <div className="flex items-center justify-between gap-2 border-b border-[#E4E2D8] px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-[#141E16]">
                    My Fields
                  </span>
                  <span className="rounded bg-[#EAE8E0] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#38473B] tabular-nums">
                    {records.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="primary" size="sm" onClick={startDrawingNewField}>
                    <Plus className="h-3.5 w-3.5" />
                    New Field
                  </Button>
                  <button
                    type="button"
                    onClick={handleUseGps}
                    title="Use GPS location"
                    className="rounded-lg border border-[#D5D3C8] bg-white p-1.5 text-[#38473B] hover:bg-[#F4F3EE] hover:text-[#141E16] cursor-pointer"
                  >
                    <Crosshair className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanelCollapsed(true)}
                    title="Minimize panel"
                    className="rounded-lg p-1.5 text-[#5A6B5D] hover:bg-[#EAE8E0] hover:text-[#141E16] cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Field Switcher Tabs/Pills (if > 1 field) */}
              {records.length > 1 && (
                <div className="flex gap-1.5 overflow-x-auto border-b border-[#E4E2D8] bg-[#F8F7F3] px-3 py-2">
                  {records.map((rec) => {
                    const isSelected = selectedRecord?.field.id === rec.field.id;
                    const recArea = rec.area
                      ? rec.area.area_acres
                      : estimatePolygonArea(rec.field.geometry).acres;
                    return (
                      <button
                        key={rec.field.id}
                        type="button"
                        onClick={() => {
                          onSelectField(rec.field.id);
                          zoomToPolygon(rec.field.geometry);
                        }}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer",
                          isSelected
                            ? "border-[#1F5E36] bg-[#1F5E36] text-white"
                            : "border-[#D5D3C8] bg-white text-[#141E16] hover:bg-[#EAE8E0]"
                        )}
                      >
                        <span className="max-w-[110px] truncate">{rec.field.name}</span>
                        <span
                          className={cn(
                            "font-mono text-[11px] tabular-nums",
                            isSelected ? "text-white/85" : "text-[#5A6B5D]"
                          )}
                        >
                          {recArea.toFixed(1)}ac
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Body: Either Empty State OR Single Active Field Card (No Duplication!) */}
              {records.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-[13px] font-medium text-[#141E16]">
                    No fields added yet
                  </p>
                  <p className="mt-1 text-[12px] text-[#5A6B5D]">
                    Draw your field boundary on the satellite map to get crop rotation advice.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={startDrawingNewField}
                  >
                    <Plus className="h-4 w-4" />
                    Draw Field on Map
                  </Button>
                </div>
              ) : (
                selectedRecord &&
                activeArea && (
                  <div className="p-3.5 space-y-3">
                    {/* Active Field Summary Row */}
                    <div className="flex items-center gap-3">
                      <CropImage
                        cropId={selectedRecord.field.current_crop}
                        alt={selectedRecord.field.current_crop}
                        size={44}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate text-[15px] font-semibold text-[#141E16]">
                            {selectedRecord.field.name}
                          </h3>
                          <span className="shrink-0 font-mono text-[12px] font-semibold text-[#1F5E36] tabular-nums">
                            {activeArea.acres.toFixed(1)} ac ({activeArea.kanals.toFixed(0)} k)
                          </span>
                        </div>
                        <div className="truncate text-[12px] text-[#38473B]">
                          Growing now: <strong className="font-medium text-[#141E16]">{formatCropLabel(selectedRecord.field.current_crop)}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Top Recommended Next Crop Box */}
                    {selectedRecord.rotations?.strategies[0]?.steps[0] && (
                      <div className="flex items-center gap-2.5 rounded-lg border border-[#B8D4C0] bg-[#E6F0E9]/60 p-2.5">
                        <CropImage
                          cropId={selectedRecord.rotations.strategies[0].steps[0].crop_id}
                          alt={selectedRecord.rotations.strategies[0].steps[0].crop_name}
                          size={38}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#164728]">
                              Recommended Next
                            </span>
                            <span className="font-mono text-[11px] font-semibold text-[#164728] tabular-nums">
                              {selectedRecord.rotations.strategies[0].overall_score.toFixed(0)}/100
                            </span>
                          </div>
                          <div className="truncate text-[13px] font-semibold text-[#141E16]">
                            {selectedRecord.rotations.strategies[0].steps[0].crop_name} ({selectedRecord.rotations.strategies[0].steps[0].local_name})
                          </div>
                          <div className="text-[11px] text-[#38473B]">
                            Sow: {selectedRecord.rotations.strategies[0].steps[0].planting_window}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Primary CTA */}
                    {onOpenAdvice && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full"
                        onClick={onOpenAdvice}
                      >
                        <Sprout className="h-4 w-4" />
                        View Full Recommendations
                      </Button>
                    )}

                    {/* Compact Secondary Action Strip */}
                    <div className="flex items-center justify-between border-t border-[#E4E2D8] pt-2.5 text-[12px]">
                      {onEditSelectedField && (
                        <button
                          type="button"
                          onClick={onEditSelectedField}
                          className="inline-flex items-center gap-1 font-medium text-[#38473B] hover:text-[#141E16] cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Edit Data</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={startRedrawBoundary}
                        className="inline-flex items-center gap-1 font-medium text-[#38473B] hover:text-[#141E16] cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Redraw</span>
                      </button>
                      {onOpenExpert && (
                        <button
                          type="button"
                          onClick={onOpenExpert}
                          className="inline-flex items-center gap-1 font-medium text-[#38473B] hover:text-[#141E16] cursor-pointer"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>Advanced</span>
                        </button>
                      )}
                      {onDeleteField && (
                        <button
                          type="button"
                          onClick={() => onDeleteField(selectedRecord.field.id)}
                          className="inline-flex items-center gap-1 font-medium text-[#8C261E] hover:underline cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
