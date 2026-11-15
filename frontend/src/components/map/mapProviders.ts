export type MapProviderId = "esri" | "osm";

export interface MapProvider {
  id: MapProviderId;
  label: string;
  tiles: string[];
  attribution: string;
  resolution: string;
  license: string;
}

export const MAP_PROVIDERS: MapProvider[] = [
  {
    id: "esri",
    label: "Satellite imagery",
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: "Esri World Imagery",
    resolution: "Commercial imagery mosaic; variable resolution",
    license: "Esri terms of use",
  },
  {
    id: "osm",
    label: "Street map",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: "© OpenStreetMap contributors",
    resolution: "Community vector-derived tiles; variable resolution",
    license: "ODbL 1.0",
  },
];

export function getMapProvider(id: MapProviderId): MapProvider {
  return MAP_PROVIDERS.find((provider) => provider.id === id) ?? MAP_PROVIDERS[0];
}
