import type { SavedFieldRecord } from "@/types/rotara";

export interface OverlayVisual {
  fillColor: string;
  fillOpacity: number;
  lineColor: string;
  lineWidth: number;
  label: string;
  legend: { color: string; text: string }[];
}

export function resolveFieldOverlay(record: SavedFieldRecord | null): OverlayVisual {
  return {
    fillColor: "#FACC15",
    fillOpacity: record ? 0.22 : 0.12,
    lineColor: "#FACC15",
    lineWidth: record ? 3.5 : 2,
    label: record ? record.field.name : "Field boundary",
    legend: [{ color: "#FACC15", text: "Selected field boundary" }],
  };
}
