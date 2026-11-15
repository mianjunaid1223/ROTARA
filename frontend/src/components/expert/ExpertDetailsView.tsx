"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  FlaskConical,
  GitBranch,
  Layers,
  Pencil,
  RefreshCw,
  SlidersHorizontal,
  Sprout,
} from "@/components/ui/icons";
import { FieldAnalysisView } from "@/components/analysis/FieldAnalysisView";
import { CropRotationsView } from "@/components/rotations/CropRotationsView";
import { ClimateSimulatorView } from "@/components/simulator/ClimateSimulatorView";
import { SoilHealthView } from "@/components/soil/SoilHealthView";
import { CropImage } from "@/components/ui/CropImage";
import { Button, Card, StatusText } from "@/components/ui/primitives";
import { fetchCropCalendar } from "@/lib/api/client";
import { cn, estimatePolygonArea, formatCropLabel } from "@/lib/utils";
import type { CropInfo, FarmerPriorities, SavedFieldRecord } from "@/types/rotara";

type ExpertSection = "all" | "environment" | "soil" | "rotations" | "simulator";

interface ExpertDetailsViewProps {
  record: SavedFieldRecord | null;
  syncing: boolean;
  onRefresh: () => void;
  onEditField: () => void;
  onSwitchToFarmer?: () => void;
  onUpdatePriorities: (priorities: FarmerPriorities) => void;
}

const SECTIONS: { id: ExpertSection; label: string; icon: typeof BarChart3 }[] = [
  { id: "all", label: "Full Hierarchical Report", icon: Layers },
  { id: "rotations", label: "1. Rotation Recommendations", icon: GitBranch },
  { id: "soil", label: "2. Soil Diagnostics", icon: FlaskConical },
  { id: "environment", label: "3. Earth Observations", icon: BarChart3 },
  { id: "simulator", label: "4. Climate Simulator", icon: SlidersHorizontal },
];

export function ExpertDetailsView({
  record,
  syncing,
  onRefresh,
  onEditField,
  onSwitchToFarmer,
  onUpdatePriorities,
}: ExpertDetailsViewProps) {
  const [section, setSection] = useState<ExpertSection>("all");
  const [calendar, setCalendar] = useState<CropInfo[]>([]);

  useEffect(() => {
    fetchCropCalendar()
      .then((res) => setCalendar(res.crops))
      .catch(() => {});
  }, []);

  if (!record) {
    return (
      <Card className="mx-auto max-w-xl py-10 text-center">
        <h2 className="text-[18px] font-semibold text-[#141E16]">
          No field selected for Advanced Agronomist Mode
        </h2>
        <p className="mt-1 text-[14px] text-[#38473B]">
          Register or select a field on the Farm Map first to inspect satellite telemetry, soil diagnostics, and multi-criteria scoring.
        </p>
      </Card>
    );
  }

  const area = record.area
    ? {
        acres: record.area.area_acres,
        hectares: record.area.area_hectares,
        kanals: record.area.area_kanals,
        lat: record.area.centroid_lat,
        lon: record.area.centroid_lon,
        zone: record.area.agro_zone_name,
      }
    : {
        ...estimatePolygonArea(record.field.geometry),
        lat: null,
        lon: null,
        zone: "Punjab Agro-Zone",
      };

  const availableSources =
    record.analysis?.data_sources.filter((s) => s.status !== "unavailable").length ?? 0;
  const totalSources = record.analysis?.data_sources.length ?? 5;

  return (
    <div className="space-y-6">
      {/* Agronomist Telemetry Context Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <CropImage
              cropId={record.field.current_crop}
              alt={record.field.current_crop}
              size={60}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#1F5E36]">
                  Agronomist & Scientific Mode · Hierarchical Telemetry
                </span>
                <StatusText tone="good">
                  {availableSources}/{totalSources} Datasets Active
                </StatusText>
              </div>
              <h1 className="mt-1 text-[22px] font-semibold text-[#141E16]">
                {record.field.name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-[#38473B] tabular-nums">
                <span>
                  {area.hectares.toFixed(2)} ha ({area.acres.toFixed(2)} ac · {area.kanals.toFixed(1)} kanals)
                </span>
                {area.lat != null && area.lon != null && (
                  <>
                    <span>·</span>
                    <span>
                      Centroid: {area.lat.toFixed(4)}°N, {area.lon.toFixed(4)}°E
                    </span>
                  </>
                )}
                <span>·</span>
                <span>Zone: {area.zone}</span>
              </div>
              <div className="mt-1 text-[13px] text-[#38473B]">
                Standing Crop: <strong className="text-[#141E16]">{formatCropLabel(record.field.current_crop)}</strong>
                {" · "}
                Preceding Crop: <strong className="text-[#141E16]">{formatCropLabel(record.field.previous_crop)}</strong>
                {" · "}
                Irrigation: <strong className="text-[#141E16]">{record.field.irrigation_type} ({record.field.water_availability})</strong>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={onEditField}>
              <Pencil className="h-4 w-4" />
              Edit Field & Lab Inputs
            </Button>
            <Button variant="outline" size="sm" disabled={syncing} onClick={onRefresh}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Re-fetch Telemetry"}
            </Button>
            {onSwitchToFarmer && (
              <Button variant="secondary" size="sm" onClick={onSwitchToFarmer}>
                <Sprout className="h-4 w-4" />
                Switch to Farmer Mode
              </Button>
            )}
          </div>
        </div>

        {/* Hierarchical Tier Navigation */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E4E2D8] pt-4">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium transition-colors cursor-pointer",
                  active
                    ? "border-[#1F5E36] bg-[#1F5E36] text-white"
                    : "border-[#D5D3C8] bg-[#F8F7F3] text-[#38473B] hover:bg-white hover:text-[#141E16]"
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* TIER 1: Deterministic Multi-Criteria Rotation Engine (Primary Recommendations First) */}
      {(section === "all" || section === "rotations") && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1F5E36]">
                1 · Multi-Criteria Crop Rotation Recommendations
              </div>
              <h2 className="text-[18px] font-semibold text-[#141E16]">
                Recommended Sequences, Priority Weighting, Scoring Breakdown & Punjab Calendar
              </h2>
            </div>
          </div>
          <CropRotationsView
            record={record}
            cropCalendar={calendar}
            loading={syncing}
            onUpdatePriorities={onUpdatePriorities}
          />
        </section>
      )}

      {/* TIER 2: Soil Health Matrix (Measured Lab vs Field History vs Satellite Proxies) */}
      {(section === "all" || section === "soil") && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1F5E36]">
                2 · Soil Health & Laboratory Diagnostics
              </div>
              <h2 className="text-[18px] font-semibold text-[#141E16]">
                Measured Laboratory Properties vs. Crop History & Remote Sensing Proxies
              </h2>
            </div>
          </div>
          <SoilHealthView record={record} onEditField={onEditField} />
        </section>
      )}

      {/* TIER 3: Earth Observation Telemetry & Environmental Diagnostics */}
      {(section === "all" || section === "environment") && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1F5E36]">
                3 · Earth Observations & Biophysical Indicators
              </div>
              <h2 className="text-[18px] font-semibold text-[#141E16]">
                Meteorological Water Balance, Thermal Regime, Optical NDVI & DEM Slope
              </h2>
            </div>
          </div>
          <FieldAnalysisView
            record={record}
            loading={syncing}
            onRefreshAnalysis={onRefresh}
            onGoToRotations={() => setSection("rotations")}
          />
        </section>
      )}

      {/* TIER 4: Parametric Climate Scenario Simulator */}
      {(section === "all" || section === "simulator") && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1F5E36]">
                4 · Parametric Climate Stress Simulator
              </div>
              <h2 className="text-[18px] font-semibold text-[#141E16]">
                Sensitivity Analysis Under Perturbed Precipitation, Temperature & Water Supply
              </h2>
            </div>
          </div>
          <ClimateSimulatorView record={record} />
        </section>
      )}
    </div>
  );
}
