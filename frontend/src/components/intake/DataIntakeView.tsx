"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, MapPin, Plus, Save, Sprout } from "@/components/ui/icons";
import { Button, Card, Input, SelectNative } from "@/components/ui/primitives";
import { CROP_CHOICES, estimatePolygonArea, formatCropLabel } from "@/lib/utils";
import type { FieldProfile, GeoJsonPolygon, IrrigationType, SoilLabInput, WaterAvailability } from "@/types/rotara";

interface DataIntakeViewProps {
  geometry: GeoJsonPolygon | null;
  editingField: FieldProfile | null;
  onSave: (field: FieldProfile, initialGeometry?: GeoJsonPolygon) => Promise<void>;
  onBackToMap: () => void;
}

const STEPS = ["Location", "Crops", "History", "Water & soil", "Review"];

export function DataIntakeView({ geometry, editingField, onSave, onBackToMap }: DataIntakeViewProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(editingField?.name ?? "My Field");
  const [currentCrop, setCurrentCrop] = useState(editingField?.current_crop ?? "wheat");
  const [previousCrop, setPreviousCrop] = useState(editingField?.previous_crop ?? "rice");
  const [customCrop, setCustomCrop] = useState("");
  const [water, setWater] = useState<WaterAvailability>(editingField?.water_availability ?? "moderate");
  const [irrigation, setIrrigation] = useState<IrrigationType>(editingField?.irrigation_type ?? "conjunctive");
  const [ph, setPh] = useState(editingField?.soil_lab?.ph?.toString() ?? "");
  const [organicMatter, setOrganicMatter] = useState(editingField?.soil_lab?.organic_matter_pct?.toString() ?? "");
  const [priority, setPriority] = useState("water");
  const [seedCost, setSeedCost] = useState("");
  const [waterCost, setWaterCost] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);

  const area = geometry ? estimatePolygonArea(geometry) : null;
  const cropLabel = currentCrop === "custom" ? customCrop || "Custom crop" : formatCropLabel(currentCrop);
  const canContinue = step === 0 ? Boolean(geometry) : step === 1 ? Boolean(currentCrop !== "custom" || customCrop.trim()) : true;

  const fieldForSave = useMemo<FieldProfile | null>(() => {
    if (!geometry) return null;
    const now = new Date().toISOString();
    return {
      id: editingField?.id ?? crypto.randomUUID(),
      name: name.trim() || "My Field",
      geometry,
      current_crop: currentCrop === "custom" ? customCrop.trim() : currentCrop,
      previous_crop: previousCrop || null,
      irrigation_type: irrigation,
      water_availability: water,
      soil_lab: ph || organicMatter ? {
        ph: ph ? Number(ph) : null,
        organic_matter_pct: organicMatter ? Number(organicMatter) : null,
      } satisfies SoilLabInput : null,
      created_at: editingField?.created_at ?? now,
      updated_at: now,
    };
  }, [customCrop, currentCrop, editingField, geometry, irrigation, name, organicMatter, ph, previousCrop, water]);

  const save = async () => {
    if (!fieldForSave) return;
    setSaving(true);
    try {
      await onSave(fieldForSave, editingField?.geometry);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="intake-shell">
      <div className="intake-header">
        <div>
          <p className="eyebrow">Field data</p>
          <h1>Build a useful field profile</h1>
          <p>Only enter what you know. Unknown values stay unknown.</p>
        </div>
        <Button variant="ghost" onClick={onBackToMap}><MapPin className="h-4 w-4" />Back to map</Button>
      </div>

      <div className="intake-steps" aria-label="Field data steps">
        {STEPS.map((label, index) => (
          <button key={label} type="button" className={index === step ? "active" : index < step ? "complete" : ""} onClick={() => index <= step && setStep(index)}>
            <span>{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>{label}
          </button>
        ))}
      </div>

      <Card className="intake-card">
        {step === 0 && (
          <div className="intake-step">
            <div className="step-icon"><MapPin /></div>
            <h2>Where is this field?</h2>
            <p>Draw the boundary, use GPS, or enter coordinates from the map tab first.</p>
            {geometry && area ? (
              <div className="metric-grid">
                <div><strong>{area.acres.toFixed(1)}</strong><span>acres</span></div>
                <div><strong>{area.kanals.toFixed(1)}</strong><span>kanals</span></div>
                <div><strong>{area.hectares.toFixed(2)}</strong><span>hectares</span></div>
              </div>
            ) : <button type="button" className="empty-action" onClick={onBackToMap}><MapPin />Choose the field on the map</button>}
            <label>Field name<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="North field" /></label>
          </div>
        )}

        {step === 1 && (
          <div className="intake-step">
            <div className="step-icon"><Sprout /></div>
            <h2>What is growing now?</h2>
            <p>Pick a known crop or add your own crop name.</p>
            <div className="crop-picker">
              {CROP_CHOICES.map((crop) => <button key={crop.id} type="button" className={currentCrop === crop.id ? "selected" : ""} onClick={() => setCurrentCrop(crop.id)}>{crop.name}<small>{crop.local}</small></button>)}
              <button type="button" className={currentCrop === "custom" ? "selected" : ""} onClick={() => setCurrentCrop("custom")}><Plus />Custom crop<small>Your own label</small></button>
            </div>
            {currentCrop === "custom" && <label>Crop name<Input autoFocus value={customCrop} onChange={(event) => setCustomCrop(event.target.value)} placeholder="e.g. sunflower" /></label>}
          </div>
        )}

        {step === 2 && (
          <div className="intake-step">
            <p className="eyebrow">History</p><h2>What came before?</h2><p>This helps compare rotations without guessing.</p>
            <label>Previous crop<SelectNative value={previousCrop ?? ""} onChange={(event) => setPreviousCrop(event.target.value)}><option value="">Not known</option><option value="fallow">Fallow / empty</option>{CROP_CHOICES.map((crop) => <option key={crop.id} value={crop.id}>{crop.name} ({crop.local})</option>)}</SelectNative></label>
            <label>What matters most this season<SelectNative value={priority} onChange={(event) => setPriority(event.target.value)}><option value="water">Save water</option><option value="income">Protect income</option><option value="soil">Improve soil</option><option value="resilience">Handle heat and dry spells</option></SelectNative></label>
            <div className="note-box">Your priority changes the order of the three plans. It does not change the underlying observations.</div>
          </div>
        )}

        {step === 3 && (
          <div className="intake-step">
            <p className="eyebrow">Inputs you know</p><h2>Water and soil</h2><p>Leave anything blank if you do not have a measurement.</p>
            <div className="form-grid">
              <label>Water access<SelectNative value={water} onChange={(event) => setWater(event.target.value as WaterAvailability)}><option value="abundant">Reliable / abundant</option><option value="moderate">Usually available</option><option value="limited">Limited</option><option value="scarce">Rain dependent</option></SelectNative></label>
              <label>Water source<SelectNative value={irrigation} onChange={(event) => setIrrigation(event.target.value as IrrigationType)}><option value="conjunctive">Canal + tubewell</option><option value="canal">Canal</option><option value="tubewell">Tubewell</option><option value="rainfed">Rain only</option><option value="drip_sprinkler">Drip / sprinkler</option></SelectNative></label>
              <label>Soil pH (optional)<Input type="number" step="0.1" value={ph} onChange={(event) => setPh(event.target.value)} placeholder="e.g. 7.8" /></label>
              <label>Organic matter % (optional)<Input type="number" step="0.1" value={organicMatter} onChange={(event) => setOrganicMatter(event.target.value)} placeholder="e.g. 0.8" /></label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="intake-step">
            <p className="eyebrow">Plan assumptions</p><h2>What will this season cost?</h2><p>These are planning inputs, not measured market prices.</p>
            <div className="form-grid"><label>Seed cost<Input type="number" min="0" value={seedCost} onChange={(event) => setSeedCost(event.target.value)} placeholder="PKR / acre" /></label><label>Water cost<Input type="number" min="0" value={waterCost} onChange={(event) => setWaterCost(event.target.value)} placeholder="PKR / acre" /></label><label>Total budget<Input type="number" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="PKR" /></label></div>
            <div className="review-summary"><strong>{name || "My Field"}</strong><span>{cropLabel} · {area?.acres.toFixed(1) ?? "—"} acres · {water} water</span><span>Priority: {priority} · Budget: {budget ? `${budget} PKR` : "not set"}</span></div>
            <Button variant="primary" size="lg" disabled={!fieldForSave || saving} onClick={() => void save()}><Save className="h-4 w-4" />{saving ? "Saving field…" : "Save field and get advice"}</Button>
          </div>
        )}

        <div className="intake-actions">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft className="h-4 w-4" />Back</Button>
          {step < 4 && <Button variant="primary" disabled={!canContinue} onClick={() => setStep((value) => Math.min(4, value + 1))}>Continue<ArrowRight className="h-4 w-4" /></Button>}
        </div>
      </Card>
    </div>
  );
}
