"use client";

import { useState } from "react";
import {
  Calendar,
  CloudOff,
  Droplets,
  Flame,
  Loader2,
  MapPin,
  RefreshCw,
  Sprout,
  Sun,
} from "lucide-react";
import { CropImage } from "@/components/ui/CropImage";
import { Button, Card } from "@/components/ui/primitives";
import { Signal, scoreToSignal, type SignalLevel } from "@/components/ui/Signal";
import { simulateClimateScenario } from "@/lib/api/client";
import type {
  ClimateScenarioInput,
  ClimateSimulationResponse,
  SavedFieldRecord,
} from "@/types/rotara";

interface AdviceViewProps {
  record: SavedFieldRecord | null;
  syncing: boolean;
  onRefresh: (record: SavedFieldRecord) => void;
  onGoToMap: () => void;
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
    label: "Less rain",
    sub: "If rain drops by 30%",
    icon: CloudOff,
    scenario: { rainfall_change_pct: -30, temp_increase_c: 0 },
  },
  {
    id: "heat",
    label: "More heat",
    sub: "If weather gets 2 C hotter",
    icon: Flame,
    scenario: { rainfall_change_pct: 0, temp_increase_c: 2 },
  },
  {
    id: "water",
    label: "Less canal water",
    sub: "If canal turn becomes scarce",
    icon: Droplets,
    scenario: {
      rainfall_change_pct: 0,
      temp_increase_c: 0,
      water_availability_override: "scarce",
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

export function AdviceView({ record, syncing, onRefresh, onGoToMap }: AdviceViewProps) {
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const [simResult, setSimResult] = useState<ClimateSimulationResponse | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  if (!record) {
    return (
      <Card className="mx-auto max-w-xl py-10 text-center">
        <MapPin className="mx-auto h-10 w-10 text-emerald-700" />
        <h2 className="mt-3 text-xl font-bold text-stone-900">No field selected yet</h2>
        <p className="mt-1 text-base text-stone-600">
          Draw your field on the map first so we can show what crop to plant next.
        </p>
        <Button variant="primary" className="mt-5" onClick={onGoToMap}>
          Go to Map
        </Button>
      </Card>
    );
  }

  const topStrategy = record.rotations?.strategies[0];
  const nextStep = topStrategy?.steps[0];
  const thenStep = topStrategy?.steps[1];

  const handleWhatIf = async (presetId: PresetId) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset || !record.analysis) return;
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
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
        <div>
          <h2 className="text-lg font-bold text-stone-900">Getting satellite data...</h2>
          <p className="text-sm text-stone-600">
            Checking weather, crop health, and soil slope for {record.field.name}.
          </p>
        </div>
      </Card>
    );
  }

  if (!topStrategy || !nextStep) {
    return (
      <Card className="mx-auto max-w-xl p-6 text-center">
        <h2 className="text-lg font-bold text-stone-900">Advice is not ready yet</h2>
        <p className="mt-1 text-sm text-stone-600">
          Tap Refresh to get weather and satellite readings for {record.field.name}.
        </p>
        <Button variant="primary" className="mt-4" onClick={() => onRefresh(record)}>
          <RefreshCw className="h-4 w-4" />
          Get Advice
        </Button>
      </Card>
    );
  }

  const waterSignal = findCriterionSignal(topStrategy.criteria_breakdown, "water");
  const heatSignal = findCriterionSignal(topStrategy.criteria_breakdown, "climate");
  const soilSignal = findCriterionSignal(topStrategy.criteria_breakdown, "soil");

  const topDelta = simResult?.strategy_deltas.find(
    (d) => d.strategy_id === topStrategy.strategy_id
  );
  const simBestCrop = simResult?.simulated_strategies[0]?.steps[0];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Main Recommendation Card */}
      <Card className="border-emerald-300 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <CropImage cropId={nextStep.crop_id} alt={nextStep.crop_name} size={96} />
            <div>
              <div className="text-sm font-bold uppercase tracking-wide text-emerald-700">
                Plant THIS next
              </div>
              <h2 className="text-2xl font-bold text-stone-900 sm:text-3xl">
                {nextStep.crop_name} ({nextStep.local_name})
              </h2>
              <div className="mt-1 flex items-center gap-2 text-base text-stone-700">
                <Calendar className="h-4 w-4 text-emerald-700" />
                <span>Sow: {nextStep.planting_window}</span>
              </div>
            </div>
          </div>

          <Button variant="outline" disabled={syncing} onClick={() => onRefresh(record)}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Updating..." : "Refresh"}
          </Button>
        </div>

        {/* 3 Clear Signals */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Signal level={waterSignal} title="Water Fit" detail={`Needs ${nextStep.water_demand_level} water`} />
          <Signal level={heatSignal} title="Heat Fit" detail="Matches seasonal heat" />
          <Signal
            level={soilSignal}
            title="Soil Fit"
            detail={nextStep.nitrogen_fixer ? "Adds nitrogen to soil" : "Good crop sequence"}
          />
        </div>

        {/* Then plant */}
        {thenStep && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5">
            <CropImage cropId={thenStep.crop_id} alt={thenStep.crop_name} size={52} />
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-stone-500">
                Then plant after harvest
              </div>
              <div className="text-base font-bold text-stone-900">
                {thenStep.crop_name} ({thenStep.local_name}) in {thenStep.planting_window}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Why? + Soil Card */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-lg font-bold text-stone-900">Why this crop?</h3>
          <ul className="mt-3 space-y-2.5 text-base text-stone-700">
            <li className="flex items-start gap-2.5">
              <Droplets className="mt-1 h-5 w-5 shrink-0 text-sky-700" />
              <span>{record.analysis?.water.farmer_summary ?? topStrategy.farmer_reason}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Sun className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
              <span>{record.analysis?.climate.farmer_summary ?? topStrategy.farmer_next_step}</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Sprout className="mt-1 h-5 w-5 shrink-0 text-emerald-700" />
              <span>{topStrategy.farmer_reason}</span>
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <h3 className="text-lg font-bold text-stone-900">Your Soil Care</h3>
          <div className="mt-3">
            <Signal
              level={soilSignal}
              title="Soil Strength"
              detail={record.soilHealth?.overall_farmer_summary}
            />
          </div>
          {record.soilHealth?.practical_actions[0] && (
            <p className="mt-3 rounded-lg bg-stone-50 p-3 text-base text-stone-800">
              <span className="font-bold">Do this: </span>
              {record.soilHealth.practical_actions[0]}
            </p>
          )}
        </Card>
      </div>

      {/* What if? Test */}
      <Card className="p-5">
        <h3 className="text-lg font-bold text-stone-900">What if weather changes?</h3>
        <p className="mt-1 text-sm text-stone-600">
          Tap one picture to test if your crop choice is still safe.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={simLoading}
                onClick={() => void handleWhatIf(preset.id)}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700"
                    : "border-stone-200 bg-white hover:bg-stone-50"
                }`}
              >
                <Icon className="h-7 w-7 shrink-0 text-amber-700" />
                <div>
                  <div className="text-base font-bold text-stone-900">{preset.label}</div>
                  <div className="text-xs text-stone-600">{preset.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        {simLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-stone-700">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
            Checking weather stress...
          </div>
        )}

        {simResult && !simLoading && (
          <div className="mt-4 space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <Signal
              level={
                topDelta && topDelta.score_delta <= -8
                  ? "risky"
                  : topDelta && topDelta.score_delta <= -2
                  ? "careful"
                  : "good"
              }
              title={`Score under this weather test (${topDelta ? `${topDelta.score_delta >= 0 ? "+" : ""}${topDelta.score_delta.toFixed(1)} pts` : ""})`}
              detail={simResult.farmer_takeaway}
            />
            {simBestCrop && (
              <div className="flex items-center gap-3 text-sm text-stone-800">
                <CropImage cropId={simBestCrop.crop_id} alt={simBestCrop.crop_name} size={40} />
                <span>
                  Best crop in this test:{" "}
                  <strong>
                    {simBestCrop.crop_name} ({simBestCrop.local_name})
                  </strong>
                </span>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
