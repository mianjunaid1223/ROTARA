"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  FlaskConical,
  MapPin,
  Pencil,
  RotateCcw,
  Save,
  Sprout,
  Waves,
} from "@/components/ui/icons";
import { CropImage } from "@/components/ui/CropImage";
import { Button, Card, Input, SelectNative } from "@/components/ui/primitives";
import {
  buildPolygonAroundPoint,
  cn,
  CROP_CHOICES_WITH_NONE,
  estimatePolygonArea,
  formatCropLabel,
  polygonCentroid,
} from "@/lib/utils";
import type {
  FarmerPriorities,
  FieldProfile,
  GeoJsonPolygon,
  IrrigationType,
  SoilLabInput,
  WaterAvailability,
} from "@/types/rotara";

interface DataIntakeViewProps {
  geometry: GeoJsonPolygon | null;
  editingField: FieldProfile | null;
  initialPriorities?: FarmerPriorities;
  onGeometryChange: (geometry: GeoJsonPolygon | null) => void;
  onRequestDrawOnMap: () => void;
  onSave: (
    field: FieldProfile,
    initialGeometry?: GeoJsonPolygon,
    priorities?: FarmerPriorities
  ) => Promise<void>;
  onBackToMap: () => void;
}

const WATER_LEVEL_OPTIONS: {
  id: WaterAvailability;
  label: string;
  desc: string;
}[] = [
  { id: "abundant", label: "Reliable / Abundant", desc: "Regular canal turn or ample tubewell" },
  { id: "moderate", label: "Moderate / Usual", desc: "Standard seasonal water access" },
  { id: "limited", label: "Limited Supply", desc: "Short canal turns; must conserve water" },
  { id: "scarce", label: "Scarce / Rainfed", desc: "Depends mostly on rainfall" },
];

const IRRIGATION_OPTIONS: { id: IrrigationType; label: string }[] = [
  { id: "conjunctive", label: "Canal + Tubewell (Conjunctive)" },
  { id: "canal", label: "Canal Water Only" },
  { id: "tubewell", label: "Tubewell Only" },
  { id: "rainfed", label: "Rainfed (Barani)" },
  { id: "drip_sprinkler", label: "Drip / High-Efficiency Sprinkler" },
];

const PRIORITY_PRESETS: {
  id: string;
  label: string;
  desc: string;
  values: FarmerPriorities;
}[] = [
  {
    id: "balanced",
    label: "Balanced Farm Plan",
    desc: "Equal weight on water, soil health, and climate safety",
    values: {
      water_conservation: 4,
      soil_improvement: 4,
      market_suitability: 3,
      climate_resilience: 4,
    },
  },
  {
    id: "water",
    label: "Save Irrigation Water",
    desc: "Prioritize low-water crops suited to dry spells",
    values: {
      water_conservation: 5,
      soil_improvement: 3,
      market_suitability: 3,
      climate_resilience: 4,
    },
  },
  {
    id: "soil",
    label: "Rebuild Soil Fertility",
    desc: "Prioritize nitrogen-fixing pulses and green manure",
    values: {
      water_conservation: 3,
      soil_improvement: 5,
      market_suitability: 3,
      climate_resilience: 3,
    },
  },
  {
    id: "market",
    label: "Protect Mandi Income",
    desc: "Prioritize high-demand Punjab cash and staple crops",
    values: {
      water_conservation: 3,
      soil_improvement: 3,
      market_suitability: 5,
      climate_resilience: 3,
    },
  },
];

function normalizeCropSelection(crop?: string | null, fallback = "none"): string {
  if (!crop) return fallback;
  const norm = crop.trim().toLowerCase();
  if (norm === "fallow" || norm === "empty" || norm === "none" || norm === "") {
    return "none";
  }
  return norm;
}

export function DataIntakeView({
  geometry,
  editingField,
  initialPriorities,
  onGeometryChange,
  onRequestDrawOnMap,
  onSave,
  onBackToMap,
}: DataIntakeViewProps) {
  const defaultCentroid = geometry ? polygonCentroid(geometry) : null;

  const [name, setName] = useState(editingField?.name ?? "North Field");
  const [currentCrop, setCurrentCrop] = useState(() =>
    normalizeCropSelection(editingField?.current_crop, "wheat")
  );
  const [previousCrop, setPreviousCrop] = useState(() =>
    normalizeCropSelection(editingField?.previous_crop, "rice")
  );
  const [water, setWater] = useState<WaterAvailability>(
    editingField?.water_availability ?? "moderate"
  );
  const [irrigation, setIrrigation] = useState<IrrigationType>(
    editingField?.irrigation_type ?? "conjunctive"
  );
  const [priorityPreset, setPriorityPreset] = useState<string>("balanced");
  const [customPriorities, setCustomPriorities] = useState<FarmerPriorities>(
    initialPriorities ?? PRIORITY_PRESETS[0].values
  );

  // Manual coordinate entry
  const [latInput, setLatInput] = useState(
    editingField?.latitude != null
      ? String(editingField.latitude)
      : defaultCentroid
      ? defaultCentroid[1].toFixed(4)
      : "31.5204"
  );
  const [lonInput, setLonInput] = useState(
    editingField?.longitude != null
      ? String(editingField.longitude)
      : defaultCentroid
      ? defaultCentroid[0].toFixed(4)
      : "74.3587"
  );
  const [coordError, setCoordError] = useState<string | null>(null);

  // Optional Soil Lab inputs
  const [showLab, setShowLab] = useState(
    Boolean(
      editingField?.soil_lab?.ph != null ||
        editingField?.soil_lab?.organic_matter_pct != null ||
        editingField?.soil_lab?.ec_ds_m != null ||
        editingField?.soil_lab?.salinity_status != null ||
        editingField?.soil_lab?.nitrogen_ppm != null
    )
  );
  const [ph, setPh] = useState(editingField?.soil_lab?.ph?.toString() ?? "");
  const [organicMatter, setOrganicMatter] = useState(
    editingField?.soil_lab?.organic_matter_pct?.toString() ?? ""
  );
  const [ec, setEc] = useState(editingField?.soil_lab?.ec_ds_m?.toString() ?? "");
  const [salinity, setSalinity] = useState<"none" | "slight" | "moderate" | "high">(
    editingField?.soil_lab?.salinity_status ?? "none"
  );
  const [texture, setTexture] = useState<NonNullable<SoilLabInput["texture"]> | "">(
    editingField?.soil_lab?.texture ?? ""
  );
  const [nitrogenPpm, setNitrogenPpm] = useState(
    editingField?.soil_lab?.nitrogen_ppm?.toString() ?? ""
  );
  const [phosphorusPpm, setPhosphorusPpm] = useState(
    editingField?.soil_lab?.phosphorus_ppm?.toString() ?? ""
  );
  const [potassiumPpm, setPotassiumPpm] = useState(
    editingField?.soil_lab?.potassium_ppm?.toString() ?? ""
  );
  const [saving, setSaving] = useState(false);

  const area = useMemo(() => (geometry ? estimatePolygonArea(geometry) : null), [geometry]);

  const handleApplyCoordinates = () => {
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCoordError("Latitude must be between -90 and 90 degrees.");
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCoordError("Longitude must be between -180 and 180 degrees.");
      return;
    }
    setCoordError(null);
    onGeometryChange(buildPolygonAroundPoint(lat, lon));
  };

  const handleResetForm = () => {
    setName(editingField?.name ?? "North Field");
    setCurrentCrop("none");
    setPreviousCrop("none");
    setWater("moderate");
    setIrrigation("conjunctive");
    setPh("");
    setOrganicMatter("");
    setEc("");
    setSalinity("none");
    setTexture("");
    setNitrogenPpm("");
    setPhosphorusPpm("");
    setPotassiumPpm("");
  };

  const fieldForSave = useMemo<FieldProfile | null>(() => {
    if (!geometry) return null;
    const now = new Date().toISOString();
    const hasAnyLab =
      Boolean(ph.trim()) ||
      Boolean(organicMatter.trim()) ||
      Boolean(ec.trim()) ||
      salinity !== "none" ||
      Boolean(texture) ||
      Boolean(nitrogenPpm.trim()) ||
      Boolean(phosphorusPpm.trim()) ||
      Boolean(potassiumPpm.trim());

    const soilLab: SoilLabInput | null = hasAnyLab
      ? {
          ph: ph.trim() ? Number(ph) : null,
          organic_matter_pct: organicMatter.trim() ? Number(organicMatter) : null,
          ec_ds_m: ec.trim() ? Number(ec) : null,
          salinity_status: salinity,
          texture: texture || null,
          nitrogen_ppm: nitrogenPpm.trim() ? Number(nitrogenPpm) : null,
          phosphorus_ppm: phosphorusPpm.trim() ? Number(phosphorusPpm) : null,
          potassium_ppm: potassiumPpm.trim() ? Number(potassiumPpm) : null,
        }
      : null;

    return {
      id: editingField?.id ?? crypto.randomUUID(),
      name: name.trim() || "My Field",
      geometry,
      current_crop: currentCrop,
      previous_crop: previousCrop,
      irrigation_type: irrigation,
      water_availability: water,
      soil_lab: soilLab,
      created_at: editingField?.created_at ?? now,
      updated_at: now,
    };
  }, [
    currentCrop,
    ec,
    editingField,
    geometry,
    irrigation,
    name,
    nitrogenPpm,
    organicMatter,
    ph,
    phosphorusPpm,
    potassiumPpm,
    previousCrop,
    salinity,
    texture,
    water,
  ]);

  const handleSave = async () => {
    if (!fieldForSave) return;
    setSaving(true);
    try {
      await onSave(fieldForSave, editingField?.geometry, customPriorities);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[#D5D3C8] bg-white p-5">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#1F5E36]">
            Step 2 · Field Data & Crop History
          </div>
          <h1 className="mt-1 text-[22px] font-semibold text-[#141E16]">
            {editingField ? `Edit ${editingField.name}` : "Configure Your Field Profile"}
          </h1>
          <p className="mt-1 text-[14px] text-[#38473B]">
            The map beside this form stays synced with your boundary. Select what is growing now and what grew previously, including None / Fallow if the land is empty.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleResetForm}>
            <RotateCcw className="h-4 w-4" />
            Reset Inputs
          </Button>
          <Button variant="ghost" size="sm" onClick={onBackToMap}>
            <MapPin className="h-4 w-4" />
            Full Map
          </Button>
        </div>
      </div>

      {/* Section 1: Field Name & Boundary Geometry */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E4E2D8] pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1F5E36] text-[12px] font-semibold text-white">
              1
            </span>
            <h2 className="text-[16px] font-semibold text-[#141E16]">
              Field Name & Boundary Location
            </h2>
          </div>
          <Button variant="secondary" size="sm" onClick={onRequestDrawOnMap}>
            <Pencil className="h-4 w-4" />
            {geometry ? "Redraw on Map" : "Draw Corners on Map"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-[#141E16]">
              Field Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. North Canal Plot"
            />
          </div>

          {geometry && area ? (
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#B8D4C0] bg-[#E6F0E9] p-3 text-center">
              <div>
                <div className="font-mono text-[18px] font-semibold text-[#164728] tabular-nums">
                  {area.acres.toFixed(2)}
                </div>
                <div className="text-[11px] font-medium text-[#38473B]">Acres</div>
              </div>
              <div className="border-x border-[#B8D4C0]">
                <div className="font-mono text-[18px] font-semibold text-[#164728] tabular-nums">
                  {area.kanals.toFixed(1)}
                </div>
                <div className="text-[11px] font-medium text-[#38473B]">Kanals</div>
              </div>
              <div>
                <div className="font-mono text-[18px] font-semibold text-[#164728] tabular-nums">
                  {area.hectares.toFixed(2)}
                </div>
                <div className="text-[11px] font-medium text-[#38473B]">Hectares</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-[#D5D3C8] bg-[#F8F7F3] px-3.5 py-2.5 text-[13px] text-[#38473B]">
              <span>No field boundary drawn yet.</span>
              <Button variant="primary" size="sm" onClick={onRequestDrawOnMap}>
                Draw Now
              </Button>
            </div>
          )}
        </div>

        {/* Manual Coordinates Helper */}
        <div className="rounded-lg border border-[#E4E2D8] bg-[#F8F7F3] p-3.5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Manual Latitude (°N)
              </label>
              <Input
                type="number"
                step="any"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                placeholder="31.5204"
              />
            </div>
            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Manual Longitude (°E)
              </label>
              <Input
                type="number"
                step="any"
                value={lonInput}
                onChange={(e) => setLonInput(e.target.value)}
                placeholder="74.3587"
              />
            </div>
            <Button variant="outline" size="md" onClick={handleApplyCoordinates}>
              <MapPin className="h-4 w-4" />
              Set Plot from Coordinates
            </Button>
          </div>
          {coordError && (
            <p className="mt-2 text-[12px] font-medium text-[#8C261E]">{coordError}</p>
          )}
        </div>
      </Card>

      {/* Section 2: Current Crop & Previous Crop (Consistent Visual Card Grids with None/Fallow) */}
      <Card className="space-y-5">
        <div className="flex items-center gap-2 border-b border-[#E4E2D8] pb-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1F5E36] text-[12px] font-semibold text-white">
            2
          </span>
          <div>
            <h2 className="text-[16px] font-semibold text-[#141E16]">
              Current & Previous Crop Selection
            </h2>
            <p className="text-[12px] text-[#5A6B5D]">
              Select a crop card below. Choose None / Fallow if the field is currently bare or was left empty last season.
            </p>
          </div>
        </div>

        {/* Current Crop Grid */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[14px] font-semibold text-[#141E16]">
              <Sprout className="h-4 w-4 text-[#1F5E36]" />
              What is growing on this field right now?
            </label>
            <span className="rounded-md bg-[#E6F0E9] px-2.5 py-0.5 text-[12px] font-semibold text-[#164728]">
              Selected: {formatCropLabel(currentCrop)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {CROP_CHOICES_WITH_NONE.map((crop) => {
              const selected = currentCrop === crop.id;
              return (
                <button
                  key={`cur-${crop.id}`}
                  type="button"
                  onClick={() => setCurrentCrop(crop.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors cursor-pointer",
                    selected
                      ? "border-[#1F5E36] bg-[#E6F0E9] ring-2 ring-[#1F5E36]"
                      : "border-[#D5D3C8] bg-white hover:bg-[#F8F7F3]"
                  )}
                >
                  <CropImage cropId={crop.id} alt={crop.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[#141E16]">
                      {crop.name}
                    </div>
                    <div className="truncate text-[11px] text-[#38473B]">{crop.local}</div>
                    <div className="mt-0.5 text-[10px] font-medium text-[#5A6B5D]">
                      {crop.season}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Previous Crop Grid (Identical Card Pattern for Consistency!) */}
        <div className="space-y-2.5 border-t border-[#E4E2D8] pt-4">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[14px] font-semibold text-[#141E16]">
              <Sprout className="h-4 w-4 text-[#184E68]" />
              What grew on this field in the previous season?
            </label>
            <span className="rounded-md bg-[#E6F0F5] px-2.5 py-0.5 text-[12px] font-semibold text-[#184E68]">
              Previous: {formatCropLabel(previousCrop)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
            {CROP_CHOICES_WITH_NONE.map((crop) => {
              const selected = previousCrop === crop.id;
              return (
                <button
                  key={`prev-${crop.id}`}
                  type="button"
                  onClick={() => setPreviousCrop(crop.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors cursor-pointer",
                    selected
                      ? "border-[#1F5E36] bg-[#E6F0E9] ring-2 ring-[#1F5E36]"
                      : "border-[#D5D3C8] bg-white hover:bg-[#F8F7F3]"
                  )}
                >
                  <CropImage cropId={crop.id} alt={crop.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-[#141E16]">
                      {crop.name}
                    </div>
                    <div className="truncate text-[11px] text-[#38473B]">{crop.local}</div>
                    <div className="mt-0.5 text-[10px] font-medium text-[#5A6B5D]">
                      {crop.season}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Section 3: Water Supply, Irrigation & Farming Priority */}
      <Card className="space-y-4">
        <div className="flex items-center gap-2 border-b border-[#E4E2D8] pb-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1F5E36] text-[12px] font-semibold text-white">
            3
          </span>
          <h2 className="text-[16px] font-semibold text-[#141E16]">
            Water Supply & Rotation Priority
          </h2>
        </div>

        <div>
          <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#141E16]">
            <Waves className="h-4 w-4 text-[#184E68]" />
            Water Availability on This Field
          </label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {WATER_LEVEL_OPTIONS.map((opt) => {
              const active = water === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setWater(opt.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors cursor-pointer",
                    active
                      ? "border-[#1F5E36] bg-[#E6F0E9] ring-1 ring-[#1F5E36]"
                      : "border-[#D5D3C8] bg-white hover:bg-[#F8F7F3]"
                  )}
                >
                  <div className="text-[13px] font-semibold text-[#141E16]">{opt.label}</div>
                  <div className="mt-0.5 text-[12px] text-[#38473B]">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[#141E16]">
              Irrigation Source
            </label>
            <SelectNative
              value={irrigation}
              onChange={(e) => setIrrigation(e.target.value as IrrigationType)}
            >
              {IRRIGATION_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </SelectNative>
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-[#141E16]">
              Primary Goal This Season
            </label>
            <SelectNative
              value={priorityPreset}
              onChange={(e) => {
                const nextId = e.target.value;
                setPriorityPreset(nextId);
                const found = PRIORITY_PRESETS.find((p) => p.id === nextId);
                if (found) setCustomPriorities(found.values);
              }}
            >
              {PRIORITY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.desc})
                </option>
              ))}
            </SelectNative>
          </div>
        </div>
      </Card>

      {/* Section 4: Optional Soil Laboratory Measurements */}
      <Card className="space-y-4">
        <button
          type="button"
          onClick={() => setShowLab((v) => !v)}
          className="flex w-full items-center justify-between text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EAE8E0] text-[12px] font-semibold text-[#141E16]">
              4
            </span>
            <div>
              <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[#141E16]">
                <FlaskConical className="h-4 w-4 text-[#1F5E36]" />
                Soil Laboratory Measurements (Optional)
              </h2>
              <p className="text-[12px] text-[#5A6B5D]">
                Leave blank if you do not have a lab report. Satellites never guess NPK or pH.
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn("h-5 w-5 text-[#38473B] transition-transform", showLab && "rotate-180")}
          />
        </button>

        {showLab && (
          <div className="grid grid-cols-1 gap-3 border-t border-[#E4E2D8] pt-4 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Soil pH (3.5 - 10.5)
              </label>
              <Input
                type="number"
                step="0.1"
                min="3.5"
                max="10.5"
                value={ph}
                onChange={(e) => setPh(e.target.value)}
                placeholder="e.g. 7.8"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Organic Matter (%)
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="15"
                value={organicMatter}
                onChange={(e) => setOrganicMatter(e.target.value)}
                placeholder="e.g. 0.75"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Salinity EC (dS/m)
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="25"
                value={ec}
                onChange={(e) => setEc(e.target.value)}
                placeholder="e.g. 1.8"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Salinity Level
              </label>
              <SelectNative
                value={salinity}
                onChange={(e) =>
                  setSalinity(e.target.value as "none" | "slight" | "moderate" | "high")
                }
              >
                <option value="none">None (Normal)</option>
                <option value="slight">Slight</option>
                <option value="moderate">Moderate</option>
                <option value="high">High (Saline / Kallar)</option>
              </SelectNative>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Soil Texture
              </label>
              <SelectNative
                value={texture}
                onChange={(e) =>
                  setTexture(e.target.value as NonNullable<SoilLabInput["texture"]> | "")
                }
              >
                <option value="">Not specified</option>
                <option value="loam">Loam (Mera)</option>
                <option value="clay_loam">Clay Loam (Bhari Mera)</option>
                <option value="sandy_loam">Sandy Loam (Halka Mera)</option>
                <option value="silt_loam">Silt Loam</option>
                <option value="clay">Heavy Clay (Chikni)</option>
                <option value="sandy">Sandy (Retli)</option>
              </SelectNative>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Nitrogen N (ppm)
              </label>
              <Input
                type="number"
                min="0"
                value={nitrogenPpm}
                onChange={(e) => setNitrogenPpm(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Phosphorus P (ppm)
              </label>
              <Input
                type="number"
                min="0"
                value={phosphorusPpm}
                onChange={(e) => setPhosphorusPpm(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium text-[#38473B]">
                Potassium K (ppm)
              </label>
              <Input
                type="number"
                min="0"
                value={potassiumPpm}
                onChange={(e) => setPotassiumPpm(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Summary & Save Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#B8D4C0] bg-[#E6F0E9] p-4">
        <div className="text-[13px] text-[#141E16]">
          <div className="font-semibold">
            {name || "My Field"} · {area ? `${area.acres.toFixed(1)} acres` : "Boundary needed"}
          </div>
          <div className="text-[#38473B]">
            Growing now: <strong>{formatCropLabel(currentCrop)}</strong> · Previous:{" "}
            <strong>{formatCropLabel(previousCrop)}</strong> · Water: <strong>{water}</strong>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          disabled={!fieldForSave || saving}
          onClick={() => void handleSave()}
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving & Analyzing..." : "Save Field & View Recommendations"}
        </Button>
      </div>
    </div>
  );
}
