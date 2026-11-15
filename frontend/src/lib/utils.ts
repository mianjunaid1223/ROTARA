import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { GeoJsonPolygon } from "@/types/rotara";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CropChoiceItem {
  id: string;
  name: string;
  local: string;
  season: string;
}

export const NONE_CROP_CHOICE: CropChoiceItem = {
  id: "none",
  name: "None / Fallow",
  local: "Khali Zameen",
  season: "Open field",
};

export const CROP_CHOICES: readonly CropChoiceItem[] = [
  { id: "wheat", name: "Wheat", local: "Gandam", season: "Rabi" },
  { id: "rice", name: "Rice", local: "Chawal", season: "Kharif" },
  { id: "cotton", name: "Cotton", local: "Kapas", season: "Kharif" },
  { id: "maize", name: "Maize", local: "Makai", season: "Kharif" },
  { id: "sugarcane", name: "Sugarcane", local: "Ganna", season: "Annual" },
  { id: "chickpea", name: "Chickpea", local: "Chana", season: "Rabi" },
  { id: "mung_bean", name: "Mung Bean", local: "Moong", season: "Zaid" },
  { id: "lentil", name: "Lentil", local: "Masoor", season: "Rabi" },
  { id: "mustard", name: "Mustard", local: "Sarson", season: "Rabi" },
  { id: "berseem", name: "Berseem", local: "Berseem", season: "Rabi" },
  { id: "sorghum_millet", name: "Sorghum / Millet", local: "Jowar / Bajra", season: "Kharif" },
  { id: "dhaincha", name: "Green Manure", local: "Dhaincha", season: "Zaid" },
] as const;

export const CROP_CHOICES_WITH_NONE: readonly CropChoiceItem[] = [
  NONE_CROP_CHOICE,
  ...CROP_CHOICES,
];

export function isNoneOrFallowCrop(cropId?: string | null): boolean {
  if (!cropId) return true;
  const norm = cropId.trim().toLowerCase();
  return norm === "none" || norm === "fallow" || norm === "empty" || norm === "";
}

export function formatCropLabel(cropId?: string | null): string {
  if (isNoneOrFallowCrop(cropId)) {
    return "None / Fallow (Khali Zameen)";
  }
  const norm = cropId!.trim().toLowerCase();
  const found = CROP_CHOICES.find((c) => c.id === norm);
  return found ? `${found.name} (${found.local})` : cropId!;
}

export function buildPolygonAroundPoint(
  lat: number,
  lon: number,
  halfWidthDeg = 0.0014,
  halfHeightDeg = 0.0012
): GeoJsonPolygon {
  const minLon = Number((lon - halfWidthDeg).toFixed(6));
  const maxLon = Number((lon + halfWidthDeg).toFixed(6));
  const minLat = Number((lat - halfHeightDeg).toFixed(6));
  const maxLat = Number((lat + halfHeightDeg).toFixed(6));
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ],
  };
}

function ringAreaM2(ring: number[][]): number {
  if (!ring || ring.length < 4) return 0;
  const R = 6378137;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    total +=
      ((lon2 - lon1) * Math.PI) /
      180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((total * R * R) / 2);
}

export function estimatePolygonArea(geometry: GeoJsonPolygon): {
  acres: number;
  hectares: number;
  kanals: number;
} {
  const exterior = geometry.coordinates[0];
  if (!exterior || exterior.length < 4) return { acres: 0, hectares: 0, kanals: 0 };
  let areaM2 = ringAreaM2(exterior);
  for (let i = 1; i < geometry.coordinates.length; i++) {
    areaM2 -= ringAreaM2(geometry.coordinates[i]);
  }
  areaM2 = Math.max(0, areaM2);
  const hectares = Number((areaM2 / 10000).toFixed(2));
  const acres = Number((areaM2 / 4046.8564224).toFixed(2));
  const kanals = Number((acres * 8).toFixed(1));
  return { acres, hectares, kanals };
}

export function polygonCentroid(geometry: GeoJsonPolygon): [number, number] {
  const ring = geometry.coordinates[0] || [];
  if (ring.length === 0) return [72.7, 31.17];
  const n = ring.length > 1 ? ring.length - 1 : ring.length;
  let sumLng = 0;
  let sumLat = 0;
  for (let i = 0; i < n; i++) {
    sumLng += ring[i][0];
    sumLat += ring[i][1];
  }
  return [sumLng / n, sumLat / n];
}
