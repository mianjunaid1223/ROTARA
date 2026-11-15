export type MapProviderId = "satellite" | "terrain" | "esri";

export interface MapProvider {
  id: "satellite" | "terrain";
  label: string;
  shortLabel: string;
  tiles: string[];
  attribution: string;
  resolution: string;
  license: string;
}

export const MAP_PROVIDERS: MapProvider[] = [
  {
    id: "satellite",
    label: "Satellite View",
    shortLabel: "Satellite",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Esri World Imagery",
    resolution: "High-resolution satellite & aerial imagery",
    license: "Esri terms of use",
  },
  {
    id: "terrain",
    label: "Terrain View",
    shortLabel: "Terrain",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Esri World Topographic & Terrain Map",
    resolution: "Topographic relief, elevation contours, and hydrography",
    license: "Esri terms of use",
  },
];

export function getMapProvider(id: MapProviderId): MapProvider {
  if (id === "esri" || id === "satellite") return MAP_PROVIDERS[0];
  return MAP_PROVIDERS.find((provider) => provider.id === id) ?? MAP_PROVIDERS[0];
}
