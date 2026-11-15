"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Droplets,
  Waves,
} from "@/components/ui/icons";
import { CropImage } from "@/components/ui/CropImage";
import { Button, Input, ModalDialog, SelectNative } from "@/components/ui/primitives";
import { CROP_CHOICES, cn, estimatePolygonArea } from "@/lib/utils";
import { buildPolygonAroundPoint } from "@/lib/utils";
import type {
  FieldProfile,
  GeoJsonPolygon,
  IrrigationType,
  SoilLabInput,
  WaterAvailability,
} from "@/types/rotara";

interface FieldRegistrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialGeometry: GeoJsonPolygon | null;
  editingField: FieldProfile | null;
  onSave: (field: FieldProfile, initialGeometry?: GeoJsonPolygon) => Promise<void>;
}

const WATER_OPTIONS: {
  label: string;
  sub: string;
  irrigation: IrrigationType;
  availability: WaterAvailability;
  icon: typeof Waves;
}[] = [
  {
    label: "Good Canal Water",
    sub: "Regular canal turn or plenty of tubewell water",
    irrigation: "conjunctive",
    availability: "abundant",
    icon: Waves,
  },
  {
    label: "Limited Tubewell / Canal",
    sub: "Water comes sometimes, must save water",
    irrigation: "tubewell",
    availability: "limited",
    icon: Droplets,
  },
  {
    label: "Rain Only",
    sub: "Mostly depends on rain water",
    irrigation: "rainfed",
    availability: "scarce",
    icon: CloudRain,
  },
];

export function FieldRegistrationModal({
  open,
  onOpenChange,
  initialGeometry,
  editingField,
  onSave,
}: FieldRegistrationModalProps) {
  const initialWaterIdx = editingField
    ? Math.max(
        0,
        WATER_OPTIONS.findIndex(
          (o) =>
            o.availability === editingField.water_availability ||
            o.irrigation === editingField.irrigation_type
        )
      )
    : 0;

  const [step, setStep] = useState(1);
  const [name, setName] = useState(editingField?.name ?? "My Field");
  const [currentCrop, setCurrentCrop] = useState(editingField?.current_crop ?? "wheat");
  const [previousCrop, setPreviousCrop] = useState(editingField?.previous_crop ?? "rice");
  const [waterIdx, setWaterIdx] = useState(initialWaterIdx);
  const [showLab, setShowLab] = useState(
    Boolean(editingField?.soil_lab?.ph || editingField?.soil_lab?.organic_matter_pct)
  );
  const [ph, setPh] = useState(
    editingField?.soil_lab?.ph != null ? String(editingField.soil_lab.ph) : ""
  );
  const [om, setOm] = useState(
    editingField?.soil_lab?.organic_matter_pct != null
      ? String(editingField.soil_lab.organic_matter_pct)
      : ""
  );
  const [salinity, setSalinity] = useState<"none" | "slight" | "moderate" | "high">(
    editingField?.soil_lab?.salinity_status ?? "none"
  );
  const [latitude, setLatitude] = useState(
    editingField?.latitude != null ? String(editingField.latitude) : ""
  );
  const [longitude, setLongitude] = useState(
    editingField?.longitude != null ? String(editingField.longitude) : ""
  );
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const [coordinateGeometry, setCoordinateGeometry] = useState<GeoJsonPolygon | null>(null);

  const geometry = coordinateGeometry ?? editingField?.geometry ?? initialGeometry;

  const area = useMemo(
    () => (geometry ? estimatePolygonArea(geometry) : null),
    [geometry]
  );

  const handleConfirmSave = () => {
    if (!geometry) return;
    const water = WATER_OPTIONS[waterIdx] ?? WATER_OPTIONS[0];
    const now = new Date().toISOString();

    let soilLab: SoilLabInput | null = null;
    if (showLab && (ph.trim() || om.trim() || salinity !== "none")) {
      soilLab = {
        ph: ph.trim() ? Number(ph) : null,
        organic_matter_pct: om.trim() ? Number(om) : null,
        salinity_status: salinity,
      };
    }

    const field: FieldProfile = {
      id: editingField?.id ?? crypto.randomUUID(),
      name: name.trim() || "My Field",
      geometry,
      latitude: latitude.trim() ? Number(latitude) : null,
      longitude: longitude.trim() ? Number(longitude) : null,
      current_crop: currentCrop,
      previous_crop: previousCrop || null,
      irrigation_type: water.irrigation,
      water_availability: water.availability,
      soil_lab: soilLab,
      created_at: editingField?.created_at ?? now,
      updated_at: now,
    };

    onOpenChange(false);
    void onSave(field, initialGeometry ?? undefined);
  };

  const locateCoordinates = () => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCoordinateError("Latitude must be between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCoordinateError("Longitude must be between -180 and 180.");
      return;
    }
    setCoordinateError(null);
    setCoordinateGeometry(buildPolygonAroundPoint(lat, lon));
  };

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingField ? "Update Field" : "Add Your Field"}
      description={`Step ${step} of 3`}
    >
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-stone-800">
              Field Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. North Plot or Well Field"
            />
          </div>

          {area && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-sm font-medium text-emerald-900">Measured Field Size</div>
              <div className="mt-1 text-2xl font-bold text-emerald-950">
                {area.acres.toFixed(1)} acres ({area.kanals.toFixed(0)} kanals)
              </div>
            </div>
          )}

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="mb-2 text-sm font-semibold text-stone-800">Manual coordinates (optional)</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">Latitude</label>
                <Input
                  type="number"
                  min="-90"
                  max="90"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="31.5204"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">Longitude</label>
                <Input
                  type="number"
                  min="-180"
                  max="180"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="74.3587"
                />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-stone-600">Creates an editable starter polygon around the point.</span>
              <Button variant="outline" onClick={locateCoordinates}>Locate coordinates</Button>
            </div>
            {coordinateError && <p className="mt-2 text-xs font-medium text-red-700">{coordinateError}</p>}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setStep(2)}>
              Next: Pick Crops
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-sm font-semibold text-stone-800">
              What crop is growing now?
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {CROP_CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCurrentCrop(c.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors",
                    currentCrop === c.id
                      ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700"
                      : "border-stone-200 bg-white hover:bg-stone-50"
                  )}
                >
                  <CropImage cropId={c.id} alt={c.name} size={44} />
                  <span className="text-xs font-bold text-stone-900">{c.name}</span>
                  <span className="text-[11px] text-stone-600">{c.local}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-stone-800">
              What crop grew before this?
            </label>
            <SelectNative
              value={previousCrop}
              onChange={(e) => setPreviousCrop(e.target.value)}
            >
              <option value="fallow">Empty / Fallow land</option>
              {CROP_CHOICES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.local})
                </option>
              ))}
            </SelectNative>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="primary" onClick={() => setStep(3)}>
              Next: Water
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="text-sm font-semibold text-stone-800">
            How do you water this field?
          </div>
          <div className="space-y-2.5">
            {WATER_OPTIONS.map((opt, idx) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setWaterIdx(idx)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors",
                    waterIdx === idx
                      ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700"
                      : "border-stone-200 bg-white hover:bg-stone-50"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-emerald-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-stone-900">{opt.label}</div>
                    <div className="text-xs text-stone-600">{opt.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowLab((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700"
          >
            <span>I have a soil test paper (optional)</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showLab && "rotate-180")} />
          </button>

          {showLab && (
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-stone-200 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">Soil pH</label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="7.8"
                  value={ph}
                  onChange={(e) => setPh(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">
                  Organic Matter %
                </label>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="0.7"
                  value={om}
                  onChange={(e) => setOm(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-700">Salts</label>
                <SelectNative
                  value={salinity}
                  onChange={(e) =>
                    setSalinity(e.target.value as "none" | "slight" | "moderate" | "high")
                  }
                >
                  <option value="none">None</option>
                  <option value="slight">Light</option>
                  <option value="moderate">Medium</option>
                  <option value="high">Strong</option>
                </SelectNative>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="primary" disabled={!geometry} onClick={handleConfirmSave}>
              Save Field
            </Button>
          </div>
        </div>
      )}
    </ModalDialog>
  );
}
