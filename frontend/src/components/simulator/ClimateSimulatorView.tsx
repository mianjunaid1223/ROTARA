"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, SlidersHorizontal } from "@/components/ui/icons";
import { CropImage } from "@/components/ui/CropImage";
import {
  Button,
  Card,
  SelectNative,
  Slider,
  StatusText,
} from "@/components/ui/primitives";
import { simulateClimateScenario } from "@/lib/api/client";
import type {
  ClimateScenarioInput,
  ClimateSimulationResponse,
  SavedFieldRecord,
  WaterAvailability,
} from "@/types/rotara";

interface ClimateSimulatorViewProps {
  record: SavedFieldRecord | null;
}

export function ClimateSimulatorView({ record }: ClimateSimulatorViewProps) {
  const [scenario, setScenario] = useState<ClimateScenarioInput>({
    rainfall_change_pct: -15,
    temp_increase_c: 1.5,
    water_availability_override: null,
  });
  const recordKey = useMemo(
    () =>
      record
        ? JSON.stringify({
          field: record.field,
          priorities: record.priorities,
          analyzedAt: record.analysis?.analyzed_at ?? null,
          weatherCount: record.analysis?.weather_series.length ?? 0,
        })
        : "",
    [record]
  );

  const [resultState, setResultState] = useState<{
    recordKey: string;
    res: ClimateSimulationResponse;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<{
    recordKey: string;
    message: string;
  } | null>(null);

  const requestGenRef = useRef(0);
  const scenarioRef = useRef(scenario);
  const recordKeyRef = useRef(recordKey);

  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  useEffect(() => {
    recordKeyRef.current = recordKey;
  }, [recordKey]);

  const result =
    resultState && resultState.recordKey === recordKey ? resultState.res : null;
  const error =
    errorState && errorState.recordKey === recordKey ? errorState.message : null;

  const runSim = async (nextScenario: ClimateScenarioInput) => {
    if (!record) return;
    const reqId = ++requestGenRef.current;
    const targetKey = recordKey;
    try {
      setLoading(true);
      setErrorState(null);
      const res = await simulateClimateScenario({
        field: record.field,
        priorities: record.priorities,
        scenario: nextScenario,
        analysis: record.analysis,
      });
      if (reqId !== requestGenRef.current || targetKey !== recordKeyRef.current) {
        return;
      }
      setResultState({ recordKey: targetKey, res });
    } catch (err) {
      if (reqId !== requestGenRef.current || targetKey !== recordKeyRef.current) {
        return;
      }
      setErrorState({
        recordKey: targetKey,
        message: err instanceof Error ? err.message : "Simulation failed.",
      });
    } finally {
      if (reqId === requestGenRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!record) return;
    const reqId = ++requestGenRef.current;
    const targetKey = recordKey;
    simulateClimateScenario({
      field: record.field,
      priorities: record.priorities,
      scenario: scenarioRef.current,
      analysis: record.analysis,
    })
      .then((res) => {
        if (reqId !== requestGenRef.current || targetKey !== recordKeyRef.current) {
          return;
        }
        setResultState({ recordKey: targetKey, res });
        setErrorState(null);
        setLoading(false);
      })
      .catch((err) => {
        if (reqId !== requestGenRef.current || targetKey !== recordKeyRef.current) {
          return;
        }
        setErrorState({
          recordKey: targetKey,
          message: err instanceof Error ? err.message : "Simulation failed.",
        });
        setLoading(false);
      });
  }, [record, recordKey]);

  if (!record) {
    return (
      <Card>
        <p className="text-[15px] text-[#4A564D]">
          Select or register a field first to test hypothetical weather scenarios.
        </p>
      </Card>
    );
  }

  const chartData =
    result?.strategy_deltas.map((d) => ({
      name: `Strategy ${d.strategy_id}`,
      Baseline: d.baseline_score,
      Hypothetical: d.simulated_score,
    })) || [];

  return (
    <div className="space-y-5">
      {/* Hypothetical Warning Banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#E7D4AE] bg-[#F7EFE0] px-4 py-3 text-[13px] text-[#7D4F10]">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <span className="font-semibold">Hypothetical Scenario Mode:</span>{" "}
          These numbers test &ldquo;what-if&rdquo; conditions. They are not live NASA observations or official weather forecasts.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Controls */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-[#1A221C]">
            <SlidersHorizontal className="h-4 w-4 text-[#2A6A3E]" strokeWidth={1.5} />
            Test What-If Conditions
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-[#4A564D]">Rainfall change</span>
              <span className="font-mono font-semibold text-[#1A221C] tabular-nums">
                {scenario.rainfall_change_pct > 0 ? "+" : ""}
                {scenario.rainfall_change_pct}%
              </span>
            </div>
            <Slider
              min={-40}
              max={40}
              step={5}
              value={[scenario.rainfall_change_pct]}
              onValueChange={([v]) =>
                setScenario((s) => ({ ...s, rainfall_change_pct: v }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-[#4A564D]">Temperature shift</span>
              <span className="font-mono font-semibold text-[#1A221C] tabular-nums">
                {scenario.temp_increase_c > 0 ? "+" : ""}
                {scenario.temp_increase_c.toFixed(1)} °C
              </span>
            </div>
            <Slider
              min={0}
              max={4}
              step={0.5}
              value={[scenario.temp_increase_c]}
              onValueChange={([v]) =>
                setScenario((s) => ({ ...s, temp_increase_c: v }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[13px] text-[#4A564D]">
              Canal / Tubewell water supply
            </label>
            <SelectNative
              value={scenario.water_availability_override || ""}
              onChange={(e) =>
                setScenario((s) => ({
                  ...s,
                  water_availability_override: (e.target.value || null) as WaterAvailability | null,
                }))
              }
            >
              <option value="">
                Keep field setting ({record.field.water_availability})
              </option>
              <option value="abundant">Abundant</option>
              <option value="moderate">Moderate</option>
              <option value="limited">Limited</option>
              <option value="scarce">Scarce</option>
            </SelectNative>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => void runSim(scenario)}
              disabled={loading}
            >
              {loading ? "Simulating..." : "Run Scenario"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const dryPreset: ClimateScenarioInput = {
                  rainfall_change_pct: -20,
                  temp_increase_c: 2.0,
                  water_availability_override: "limited",
                };
                setScenario(dryPreset);
                void runSim(dryPreset);
              }}
            >
              Dry & Hot Preset
            </Button>
          </div>

          {error ? <p className="text-[12px] text-[#A63A2B]">{error}</p> : null}
        </Card>

        {/* Baseline vs Hypothetical Chart */}
        <Card className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-[16px] font-semibold text-[#1A221C]">
                Strategy Suitability: Baseline vs Hypothetical
              </h3>
              <p className="text-[13px] text-[#4A564D]">
                {result?.farmer_takeaway || "Adjust sliders and click Run Scenario."}
              </p>
            </div>
            <StatusText tone="warn">Hypothetical</StatusText>
          </div>

          {chartData.length > 0 ? (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DA" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#4A564D" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#6B786E" }} width={40} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#DFDDD3",
                      borderRadius: "10px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="Baseline" fill="#8C998E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Hypothetical" fill="#2A6A3E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          {result ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {result.strategy_deltas.map((d) => (
                <div
                  key={d.strategy_id}
                  className="rounded-xl border border-[#DFDDD3] bg-[#F6F5F0] p-3 text-[12px]"
                >
                  <div className="font-semibold text-[#1A221C]">
                    Strategy {d.strategy_id}
                  </div>
                  <div className="text-[#4A564D] truncate">{d.title}</div>
                  <div className="mt-2 flex items-center justify-between font-mono tabular-nums">
                    <span>
                      {d.baseline_score.toFixed(1)} to {d.simulated_score.toFixed(1)}
                    </span>
                    <StatusText
                      dot={false}
                      tone={
                        d.score_delta > 0 ? "good" : d.score_delta < 0 ? "risk" : "neutral"
                      }
                    >
                      {d.score_delta > 0 ? "+" : ""}
                      {d.score_delta.toFixed(1)}
                    </StatusText>
                  </div>
                  <div className="mt-1 text-[11px] text-[#5C6B5E]">
                    Rank #{d.baseline_rank} to #{d.simulated_rank}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Crop Suitability Shifts & Assumptions */}
      {result ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="space-y-3">
            <h3 className="text-[16px] font-semibold text-[#1A221C]">
              Crop Sensitivity Under This Scenario
            </h3>
            <div className="space-y-2">
              {result.crop_suitability_shifts.map((c) => (
                <div
                  key={c.crop_id}
                  className="flex items-center justify-between rounded-xl border border-[#DFDDD3] bg-[#F6F5F0] px-3 py-2 text-[13px]"
                >
                  <div className="flex items-center gap-2.5">
                    <CropImage
                      cropId={c.crop_id}
                      alt={c.crop_name}
                      size={32}
                      className="rounded-lg border border-[#E2E0D6]"
                    />
                    <div>
                      <span className="font-medium text-[#141E16]">{c.crop_name}</span>
                      <span className="ml-2 text-[12px] text-[#5C6B5E]">{c.season}</span>
                    </div>
                  </div>
                  <StatusText
                    dot={false}
                    tone={
                      c.direction === "improved"
                        ? "good"
                        : c.direction === "reduced"
                          ? "risk"
                          : "neutral"
                    }
                  >
                    <span className="font-mono tabular-nums">
                      {c.suitability_change > 0 ? "+" : ""}
                      {c.suitability_change.toFixed(1)} ({c.direction})
                    </span>
                  </StatusText>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="text-[16px] font-semibold text-[#1A221C]">
              Model Assumptions
            </h3>
            <ul className="space-y-2 text-[13px] text-[#4A564D] list-disc pl-5">
              {result.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <div className="rounded-xl border border-[#DFDDD3] bg-[#F6F5F0] p-3 font-mono text-[12px] text-[#4A564D] space-y-1">
              <div>
                Baseline 30d rain: {result.baseline_summary.rainfall_30d_mm ?? "n/a"} mm |
                Simulated: {result.simulated_summary.rainfall_30d_mm ?? "n/a"} mm
              </div>
              <div>
                Baseline 30d temp: {result.baseline_summary.temp_mean_30d_c ?? "n/a"} °C |
                Simulated: {result.simulated_summary.temp_mean_30d_c ?? "n/a"} °C
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
