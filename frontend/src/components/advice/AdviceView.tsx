"use client";

import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CloudOff,
  Droplets,
  Flame,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Sprout,
  Sun,
} from "@/components/ui/icons";
import { CropImage } from "@/components/ui/CropImage";
import { Button, Card, StatusText } from "@/components/ui/primitives";
import { Signal, scoreToSignal, type SignalLevel } from "@/components/ui/Signal";
import { simulateClimateScenario } from "@/lib/api/client";
import { cn, estimatePolygonArea, formatCropLabel } from "@/lib/utils";
import type {
  ClimateScenarioInput,
  ClimateSimulationResponse,
  FarmerPriorities,
  SavedFieldRecord,
} from "@/types/rotara";

interface AdviceViewProps {
  record: SavedFieldRecord | null;
  syncing: boolean;
  onRefresh: (record: SavedFieldRecord) => void;
  onGoToMap: () => void;
  onEditField?: () => void;
  onSwitchToExpert?: () => void;
  onUpdatePriorities?: (priorities: FarmerPriorities) => void;
}

type PresetId = "rain" | "heat" | "water";

const PRESETS: {
  id: PresetId;
  label: string;
  sub: string;
  icon: typeof CloudOff;
  scenario: ClimateScenarioInput;
}[] = [
  {
    id: "rain",
    label: "30% Less Rain",
    sub: "Test if monsoon or winter rain drops sharply",
    icon: CloudOff,
    scenario: { rainfall_change_pct: -30, temp_increase_c: 0 },
  },
  {
    id: "heat",
    label: "+2°C Hotter Season",
    sub: "Test if daytime heat waves intensify",
    icon: Flame,
    scenario: { rainfall_change_pct: 0, temp_increase_c: 2 },
  },
  {
    id: "water",
    label: "Canal Water Shortage",
    sub: "Test if irrigation water becomes scarce",
    icon: Droplets,
    scenario: {
      rainfall_change_pct: 0,
      temp_increase_c: 0,
      water_availability_override: "scarce",
    },
  },
];

const QUICK_PRIORITIES: {
  id: string;
  label: string;
  priorities: FarmerPriorities;
}[] = [
  {
    id: "water",
    label: "Save Water",
    priorities: {
      water_conservation: 5,
      soil_improvement: 3,
      market_suitability: 3,
      climate_resilience: 4,
    },
  },
  {
    id: "soil",
    label: "Build Soil Health",
    priorities: {
      water_conservation: 3,
      soil_improvement: 5,
      market_suitability: 3,
      climate_resilience: 3,
    },
  },
  {
    id: "resilience",
    label: "Beat Heat & Dry Spells",
    priorities: {
      water_conservation: 4,
      soil_improvement: 3,
      market_suitability: 3,
      climate_resilience: 5,
    },
  },
  {
    id: "market",
    label: "Mandi Demand",
    priorities: {
      water_conservation: 3,
      soil_improvement: 3,
      market_suitability: 5,
      climate_resilience: 3,
    },
  },
];

function findCriterionSignal(
  criteria: { criterion: string; score: number }[],
  keyword: string
): SignalLevel {
  const found = criteria.find((c) => c.criterion.toLowerCase().includes(keyword));
  return scoreToSignal(found?.score);
}

export function AdviceView({
  record,
  syncing,
  onRefresh,
  onGoToMap,
  onEditField,
  onSwitchToExpert,
  onUpdatePriorities,
}: AdviceViewProps) {
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const [simResult, setSimResult] = useState<ClimateSimulationResponse | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  if (!record) {
    return (
      <Card className="mx-auto max-w-xl py-10 text-center">
        <MapPin className="mx-auto h-10 w-10 text-[#1F5E36]" />
        <h2 className="mt-3 text-[20px] font-semibold text-[#141E16]">No field selected yet</h2>
        <p className="mt-1 text-[14px] text-[#38473B]">
          Draw your field on the Farm Map first so we can check satellite observations and recommend your crop rotation.
        </p>
        <Button variant="primary" className="mt-5" onClick={onGoToMap}>
          Go to Farm Map
        </Button>
      </Card>
    );
  }

  const topStrategy = record.rotations?.strategies[0];
  const nextStep = topStrategy?.steps[0];
  const thenStep = topStrategy?.steps[1];
  const area = record.area
    ? {
        acres: record.area.area_acres,
        kanals: record.area.area_kanals,
        hectares: record.area.area_hectares,
      }
    : estimatePolygonArea(record.field.geometry);

  const handleWhatIf = async (presetId: PresetId) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(presetId);
    setSimLoading(true);
    try {
      const res = await simulateClimateScenario({
        field: record.field,
        priorities: record.priorities,
        scenario: preset.scenario,
        analysis: record.analysis,
      });
      setSimResult(res);
    } finally {
      setSimLoading(false);
    }
  };

  if (syncing && !topStrategy) {
    return (
      <Card className="mx-auto flex max-w-xl items-center gap-4 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-[#1F5E36]" />
        <div>
          <h2 className="text-[18px] font-semibold text-[#141E16]">
            Loading NASA satellite & weather observations...
          </h2>
          <p className="mt-0.5 text-[14px] text-[#38473B]">
            Checking rainfall, heat stress, crop greenness, and terrain slope for {record.field.name}.
          </p>
        </div>
      </Card>
    );
  }

  if (!topStrategy || !nextStep) {
    return (
      <Card className="mx-auto max-w-xl p-6 text-center">
        <h2 className="text-[18px] font-semibold text-[#141E16]">
          Field recommendations are ready to run
        </h2>
        <p className="mt-1 text-[14px] text-[#38473B]">
          Click Load Advice to fetch weather and satellite readings for {record.field.name}.
        </p>
        <Button variant="primary" className="mt-4" onClick={() => onRefresh(record)}>
          <RefreshCw className="h-4 w-4" />
          Load Advice
        </Button>
      </Card>
    );
  }

  const waterSignal = findCriterionSignal(topStrategy.criteria_breakdown, "water");
  const climateSignal = findCriterionSignal(topStrategy.criteria_breakdown, "climate");
  const soilSignal = findCriterionSignal(topStrategy.criteria_breakdown, "soil");

  const topDelta = simResult?.strategy_deltas.find(
    (d) => d.strategy_id === topStrategy.strategy_id
  );
  const simBestCrop = simResult?.simulated_strategies[0]?.steps[0];
  const analysis = record.analysis;

  return (
    <div className="w-full space-y-6">
      {/* PRIMARY SECTION: Crop Recommendation & Rotation Plans (First & Foremost) */}
      <div className="space-y-4">
        {/* Compact Field & Priority Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D5D3C8] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <CropImage
              cropId={record.field.current_crop}
              alt={record.field.current_crop}
              size={40}
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[17px] font-semibold text-[#141E16]">
                  {record.field.name}
                </h1>
                <span className="font-mono text-[13px] font-semibold text-[#1F5E36] tabular-nums">
                  {area.acres.toFixed(1)} ac ({area.kanals.toFixed(0)} kanals)
                </span>
                {record.rotations?.current_punjab_season && (
                  <StatusText tone="good">
                    {record.rotations.current_punjab_season} Season
                  </StatusText>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-[#38473B]">
                <span>
                  Now: <strong className="text-[#141E16]">{formatCropLabel(record.field.current_crop)}</strong>
                </span>
                <span>·</span>
                <span>
                  Previous: <strong className="text-[#141E16]">{formatCropLabel(record.field.previous_crop)}</strong>
                </span>
                <span>·</span>
                <span>
                  Water: <strong className="text-[#141E16]">{record.field.water_availability}</strong>
                </span>
                {record.area?.agro_zone_name && (
                  <>
                    <span>·</span>
                    <span>{record.area.agro_zone_name}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onUpdatePriorities && (
              <div className="flex flex-wrap items-center gap-1 mr-1">
                <span className="text-[12px] font-medium text-[#5A6B5D] mr-1">Goal:</span>
                {QUICK_PRIORITIES.map((qp) => (
                  <button
                    key={qp.id}
                    type="button"
                    onClick={() => onUpdatePriorities(qp.priorities)}
                    className="rounded-lg border border-[#D5D3C8] bg-[#F8F7F3] px-2.5 py-1 text-[12px] font-medium text-[#141E16] hover:bg-[#E6F0E9] hover:border-[#1F5E36] cursor-pointer"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
            )}
            {onEditField && (
              <Button variant="outline" size="sm" onClick={onEditField}>
                <Pencil className="h-3.5 w-3.5" />
                Edit Field
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={syncing} onClick={() => onRefresh(record)}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Refreshing..." : "Refresh"}
            </Button>
            {onSwitchToExpert && (
              <Button variant="secondary" size="sm" onClick={onSwitchToExpert}>
                <BarChart3 className="h-3.5 w-3.5" />
                Advanced Mode
              </Button>
            )}
          </div>
        </div>

        {/* Top Recommendation Hero Card */}
        <Card className="border-2 border-[#1F5E36] bg-white p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="flex flex-col justify-between gap-4 lg:col-span-7">
              <div className="flex flex-wrap items-center gap-4">
                <CropImage cropId={nextStep.crop_id} alt={nextStep.crop_name} size={96} />
                <div>
                  <div className="inline-flex items-center gap-2 rounded-md bg-[#E6F0E9] px-2.5 py-1 text-[12px] font-semibold text-[#164728]">
                    Recommended Next Crop · Score {topStrategy.overall_score.toFixed(1)}/100
                  </div>
                  <h2 className="mt-2 text-[28px] font-semibold text-[#141E16]">
                    {nextStep.crop_name} ({nextStep.local_name})
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[14px] text-[#38473B]">
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#141E16]">
                      <Calendar className="h-4 w-4 text-[#1F5E36]" />
                      Sow: {nextStep.planting_window}
                    </span>
                    <span>·</span>
                    <span>Harvest: {nextStep.harvest_window}</span>
                    {nextStep.nitrogen_fixer && (
                      <>
                        <span>·</span>
                        <span className="font-semibold text-[#1F5E36]">Fixes Soil Nitrogen</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#B8D4C0] bg-[#E6F0E9] p-4 text-[14px] text-[#141E16]">
                <div className="font-semibold text-[#164728]">
                  Why this plan fits {record.field.name}:
                </div>
                <p className="mt-1 leading-relaxed text-[#141E16]">{topStrategy.farmer_reason}</p>
                <div className="mt-2 flex items-center gap-1.5 font-semibold text-[#164728]">
                  <ArrowRight className="h-4 w-4 shrink-0" />
                  <span>{topStrategy.farmer_next_step}</span>
                </div>
              </div>
            </div>

            {/* Sequence Chain Preview */}
            <div className="flex flex-col justify-between rounded-xl border border-[#D5D3C8] bg-[#F8F7F3] p-4 lg:col-span-5">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wider text-[#5A6B5D]">
                  Upcoming 3-Season Sequence ({topStrategy.title})
                </div>
                <div className="mt-3 space-y-2.5">
                  {topStrategy.steps.slice(0, 3).map((step, idx) => (
                    <div
                      key={`${step.crop_id}-${idx}`}
                      className="flex items-center gap-3 rounded-lg border border-[#D5D3C8] bg-white p-2.5"
                    >
                      <CropImage cropId={step.crop_id} alt={step.crop_name} size={44} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[14px] font-semibold text-[#141E16]">
                            {idx + 1}. {step.crop_name} ({step.local_name})
                          </span>
                          <StatusText dot={false} tone={idx === 0 ? "good" : "neutral"}>
                            {step.season}
                          </StatusText>
                        </div>
                        <div className="text-[12px] text-[#38473B]">
                          Sow: {step.planting_window} · Water: {step.water_demand_level.replace("_", " ")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {thenStep && (
                <div className="mt-3 text-[12px] text-[#5A6B5D]">
                  Following harvest in {nextStep.harvest_window}, rotate to{" "}
                  <strong className="text-[#141E16]">{thenStep.crop_name}</strong>.
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* All 3 Rotation Strategies Side-by-Side with Crop Illustrations */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(record.rotations?.strategies ?? []).slice(0, 3).map((strategy, index) => (
            <Card
              key={strategy.strategy_id}
              className={cn(
                "flex flex-col justify-between space-y-4",
                index === 0 ? "border-[#1F5E36] ring-1 ring-[#1F5E36]" : ""
              )}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <StatusText tone={index === 0 ? "good" : "neutral"}>
                    {index === 0 ? "Top Recommended" : `Option #${index + 1}`} · Plan {strategy.strategy_id}
                  </StatusText>
                  <span className="font-mono text-[16px] font-semibold text-[#1F5E36] tabular-nums">
                    {strategy.overall_score.toFixed(1)} / 100
                  </span>
                </div>

                <div>
                  <h3 className="text-[16px] font-semibold text-[#141E16]">{strategy.title}</h3>
                  <p className="text-[12px] text-[#5A6B5D]">{strategy.subtitle}</p>
                </div>

                <div className="space-y-2 rounded-lg border border-[#E4E2D8] bg-[#F8F7F3] p-2.5">
                  {strategy.steps.slice(0, 3).map((cycle, cycleIndex) => (
                    <div
                      key={`${strategy.strategy_id}-${cycleIndex}`}
                      className="flex items-center gap-2.5 rounded-md bg-white px-2.5 py-1.5 border border-[#E4E2D8]"
                    >
                      <CropImage cropId={cycle.crop_id} alt={cycle.crop_name} size={34} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-[#141E16]">
                          Cycle {cycleIndex + 1}: {cycle.crop_name}
                        </div>
                        <div className="text-[11px] text-[#5A6B5D]">
                          {cycle.local_name} · {cycle.planting_window}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[13px] leading-relaxed text-[#38473B]">
                  {strategy.farmer_reason}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* SECTION 2: Supporting Field Diagnosis (Weather, Moisture & Soil Conditions) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1F5E36]">
              Supporting Field Evidence
            </div>
            <h2 className="text-[18px] font-semibold text-[#141E16]">
              Current Weather, Moisture & Soil Conditions
            </h2>
          </div>
          <span className="text-[12px] text-[#5A6B5D]">
            Why NASA satellite and field observations point to this recommendation
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-[#141E16]">
                <Droplets className="h-4 w-4 text-[#184E68]" />
                Water & Rain
              </span>
              <span className="font-mono text-[15px] font-semibold text-[#184E68] tabular-nums">
                {analysis?.water.rainfall_30d_mm != null
                  ? `${analysis.water.rainfall_30d_mm.toFixed(0)} mm (30d)`
                  : "Pending"}
              </span>
            </div>
            <Signal
              level={waterSignal}
              title="Moisture Fit"
              detail={analysis?.water.farmer_summary ?? topStrategy.farmer_reason}
            />
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-[#141E16]">
                <Sun className="h-4 w-4 text-[#9A6318]" />
                Temperature & Heat
              </span>
              <span className="font-mono text-[15px] font-semibold text-[#7C4A0E] tabular-nums">
                {analysis?.climate.heat_stress_days_90d != null
                  ? `${analysis.climate.heat_stress_days_90d} hot days`
                  : "Pending"}
              </span>
            </div>
            <Signal
              level={climateSignal}
              title="Seasonal Heat Fit"
              detail={analysis?.climate.farmer_summary ?? topStrategy.farmer_next_step}
            />
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-[14px] font-semibold text-[#141E16]">
                <Sprout className="h-4 w-4 text-[#1F5E36]" />
                Soil Care & Cover
              </span>
              <span className="font-mono text-[13px] font-semibold text-[#1F5E36] tabular-nums">
                {record.soilHealth?.measured_lab_present ? "Lab + Satellite" : "History + Satellite"}
              </span>
            </div>
            <Signal
              level={soilSignal}
              title="Soil Strength"
              detail={record.soilHealth?.overall_farmer_summary}
            />
            {record.soilHealth?.practical_actions[0] && (
              <div className="rounded-lg border border-[#E4E2D8] bg-[#F8F7F3] px-3 py-2 text-[12px] text-[#141E16]">
                <strong>Action: </strong>
                {record.soilHealth.practical_actions[0]}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* SECTION 3: Interactive Weather Stress Test ("What if weather changes?") */}
      <Card className="space-y-4 p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1F5E36]">
            Weather Stress Test (Hypothetical)
          </div>
          <h3 className="mt-0.5 text-[18px] font-semibold text-[#141E16]">
            What if the upcoming weather turns harsh?
          </h3>
          <p className="text-[13px] text-[#38473B]">
            Click a scenario below to test whether your recommended crop plan stays safe under drought, heat, or canal shortage.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={simLoading}
                onClick={() => void handleWhatIf(preset.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors cursor-pointer",
                  active
                    ? "border-[#1F5E36] bg-[#E6F0E9] ring-2 ring-[#1F5E36]"
                    : "border-[#D5D3C8] bg-white hover:bg-[#F8F7F3]"
                )}
              >
                <Icon className="h-6 w-6 shrink-0 text-[#7C4A0E]" />
                <div>
                  <div className="text-[14px] font-semibold text-[#141E16]">{preset.label}</div>
                  <div className="text-[12px] text-[#38473B]">{preset.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        {simLoading && (
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#1F5E36]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running weather stress check...
          </div>
        )}

        {simResult && !simLoading && (
          <div className="space-y-3 rounded-xl border border-[#D5D3C8] bg-[#F8F7F3] p-4">
            <Signal
              level={
                topDelta && topDelta.score_delta <= -8
                  ? "risky"
                  : topDelta && topDelta.score_delta <= -2
                  ? "careful"
                  : "good"
              }
              title={`Plan Score Change: ${
                topDelta
                  ? `${topDelta.score_delta >= 0 ? "+" : ""}${topDelta.score_delta.toFixed(1)} points`
                  : "Tested"
              }`}
              detail={simResult.farmer_takeaway}
            />
            {simBestCrop && (
              <div className="flex items-center gap-3 rounded-lg border border-[#D5D3C8] bg-white p-3 text-[13px] text-[#141E16]">
                <CropImage cropId={simBestCrop.crop_id} alt={simBestCrop.crop_name} size={44} />
                <div>
                  <div className="text-[#5A6B5D]">Safest next crop under this weather test:</div>
                  <div className="text-[14px] font-semibold text-[#141E16]">
                    {simBestCrop.crop_name} ({simBestCrop.local_name}) · Sow {simBestCrop.planting_window}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
