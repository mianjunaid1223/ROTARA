import type { SavedFieldRecord } from "@/types/rotara";

export type OverlayMode = "outline" | "plant_health" | "water_stress";

export interface OverlayVisual {
  fillColor: string;
  fillOpacity: number;
  lineColor: string;
  lineWidth: number;
  label: string;
  legend: { color: string; text: string }[];
}

export const OVERLAY_OPTIONS: { id: OverlayMode; label: string }[] = [
  { id: "outline", label: "Outline" },
  { id: "plant_health", label: "Plant health" },
  { id: "water_stress", label: "Water stress" },
];

export function resolveFieldOverlay(
  record: SavedFieldRecord | null,
  overlay: OverlayMode
): OverlayVisual {
  if (!record || overlay === "outline") {
    return {
      fillColor: "#FACC15",
      fillOpacity: 0.22,
      lineColor: "#FACC15",
      lineWidth: 3.5,
      label: record ? record.field.name : "Field boundary",
      legend: [{ color: "#FACC15", text: "Selected field boundary" }],
    };
  }

  const analysis = record.analysis;
  if (!analysis) {
    return {
      fillColor: "#FACC15",
      fillOpacity: 0.2,
      lineColor: "#FACC15",
      lineWidth: 3.5,
      label: "Waiting for satellite data",
      legend: [{ color: "#FACC15", text: "Waiting for satellite data" }],
    };
  }

  if (overlay === "plant_health") {
    const ndvi = analysis.vegetation.latest_ndvi;
    if (ndvi == null) {
      return {
        fillColor: "#94A3B8",
        fillOpacity: 0.35,
        lineColor: "#FACC15",
        lineWidth: 3,
        label: "Waiting for clear sky view",
        legend: [{ color: "#94A3B8", text: "No recent clear-sky picture" }],
      };
    }
    if (ndvi >= 0.45) {
      return {
        fillColor: "#22C55E",
        fillOpacity: 0.42,
        lineColor: "#FACC15",
        lineWidth: 3.5,
        label: `Strong green growth (NDVI ${ndvi.toFixed(2)})`,
        legend: [{ color: "#22C55E", text: "Good green cover" }],
      };
    }
    if (ndvi >= 0.25) {
      return {
        fillColor: "#F59E0B",
        fillOpacity: 0.42,
        lineColor: "#FACC15",
        lineWidth: 3.5,
        label: `Medium crop cover (NDVI ${ndvi.toFixed(2)})`,
        legend: [{ color: "#F59E0B", text: "Medium crop cover" }],
      };
    }
    return {
      fillColor: "#EF4444",
      fillOpacity: 0.42,
      lineColor: "#FACC15",
      lineWidth: 3.5,
      label: `Bare soil or weak growth (NDVI ${ndvi.toFixed(2)})`,
      legend: [{ color: "#EF4444", text: "Bare soil / weak crop" }],
    };
  }

  const status = analysis.water.moisture_proxy_status;
  if (status === "wet" || status === "adequate") {
    return {
      fillColor: "#0EA5E9",
      fillOpacity: 0.42,
      lineColor: "#FACC15",
      lineWidth: 3.5,
      label: "Enough moisture in recent rain",
      legend: [{ color: "#0EA5E9", text: "Adequate water" }],
    };
  }
  if (status === "dry") {
    return {
      fillColor: "#F59E0B",
      fillOpacity: 0.42,
      lineColor: "#FACC15",
      lineWidth: 3.5,
      label: "Dry month, watch irrigation",
      legend: [{ color: "#F59E0B", text: "Dry weather" }],
    };
  }
  return {
    fillColor: "#EF4444",
    fillOpacity: 0.44,
    lineColor: "#FACC15",
    lineWidth: 3.5,
    label: status === "very_dry" ? "Very dry weather" : "Water status unknown",
    legend: [{ color: "#EF4444", text: status === "very_dry" ? "Very dry" : "No weather data" }],
  };
}
