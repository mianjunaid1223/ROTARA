"use client";

import React from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, CheckCircle2, Info, Sprout } from "@/components/ui/icons";
import { Calendar } from "@/components/ui/icons";
import { Card, Slider, StatusText } from "@/components/ui/primitives";
import type {
  CropInfo,
  FarmerPriorities,
  RotationResponse,
  SavedFieldRecord,
} from "@/types/rotara";

interface CropRotationsViewProps {
  record: SavedFieldRecord | null;
  cropCalendar: CropInfo[];
  loading: boolean;
  onUpdatePriorities: (priorities: FarmerPriorities) => void;
}

const PRIORITY_ITEMS: Array<{
  key: keyof FarmerPriorities;
  label: string;
  hint: string;
}> = [
  {
    key: "water_conservation",
    label: "Water Conservation",
    hint: "Favor crops that need fewer irrigations.",
  },
  {
    key: "soil_improvement",
    label: "Soil Improvement",
    hint: "Favor nitrogen-fixing pulses and root diversity.",
  },
  {
    key: "climate_resilience",
    label: "Heat & Drought Resilience",
    hint: "Favor crops tolerant of hot spells and dry gaps.",
  },
  {
    key: "market_suitability",
    label: "Local Mandi Demand",
    hint: "Weight Punjab staple and pulse market demand.",
  },
];

export function CropRotationsView({
  record,
  cropCalendar,
  loading,
  onUpdatePriorities,
}: CropRotationsViewProps) {
  if (!record) {
    return (
      <Card>
        <p className="text-[15px] text-[#4A564D]">
          Select or register a field first to compare crop-rotation strategies.
        </p>
      </Card>
    );
  }

  const rotations: RotationResponse | undefined = record.rotations;
  const priorities = record.priorities;

  const comparisonData =
    rotations?.strategies.map((s) => ({
      name: `Strategy ${s.strategy_id}`,
      score: s.overall_score,
      title: s.title,
    })) || [];

  return (
    <div className="space-y-5">
      {/* Priority Controls + Season Context */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[18px] font-semibold text-[#1A221C]">
                Your Farming Priorities
              </h2>
              <p className="text-[13px] text-[#4A564D]">
                Adjust what matters most for {record.field.name}. Rankings recalculate immediately.
              </p>
            </div>
            {loading ? <StatusText tone="neutral">Updating scores...</StatusText> : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PRIORITY_ITEMS.map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-[#DFDDD3] bg-[#F6F5F0] p-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#1A221C]">
                    {item.label}
                  </span>
                  <span className="font-mono text-[13px] font-semibold text-[#2A6A3E] tabular-nums">
                    {priorities[item.key]} / 5
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-[#6B786E]">{item.hint}</p>
                <Slider
                  className="mt-1.5"
                  min={1}
                  max={5}
                  step={1}
                  value={[priorities[item.key]]}
                  onValueChange={([v]) =>
                    onUpdatePriorities({ ...priorities, [item.key]: v })
                  }
                />
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1A221C]">
            <Calendar className="h-4 w-4 text-[#2A6A3E]" strokeWidth={1.5} />
            Punjab Season Timing
          </div>
          {rotations ? (
            <div className="space-y-2.5 text-[13px]">
              <div className="flex justify-between border-b border-[#DFDDD3] pb-2">
                <span className="text-[#4A564D]">Reference date</span>
                <span className="font-mono tabular-nums text-[#1A221C]">
                  {rotations.reference_date}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#DFDDD3] pb-2">
                <span className="text-[#4A564D]">Active season</span>
                <StatusText tone="good">{rotations.current_punjab_season}</StatusText>
              </div>
              <div className="flex justify-between border-b border-[#DFDDD3] pb-2">
                <span className="text-[#4A564D]">Next planting focus</span>
                <StatusText tone="water">{rotations.upcoming_planting_season}</StatusText>
              </div>
              <div className="text-[12px] text-[#4A564D] pt-1">
                Zone: <span className="font-medium text-[#1A221C]">{rotations.agro_zone_name}</span>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[#4A564D]">Loading season timing...</p>
          )}

          {comparisonData.length > 0 ? (
            <div className="h-[130px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#4A564D" }}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#DFDDD3",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="score" name="Suitability Score" fill="#2A6A3E" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </Card>
      </div>

      {/* Three Rotation Strategies */}
      {rotations ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {rotations.strategies.map((strat, rankIdx) => (
            <Card
              key={strat.strategy_id}
              className={`flex flex-col justify-between space-y-4 ${
                rankIdx === 0 ? "border-[#2A6A3E] ring-1 ring-[#2A6A3E]/25" : ""
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusText tone={rankIdx === 0 ? "good" : "neutral"}>
                        Rank #{rankIdx + 1} · Strategy {strat.strategy_id}
                      </StatusText>
                    </div>
                    <h3 className="mt-2 text-[17px] font-semibold text-[#1A221C]">
                      {strat.title}
                    </h3>
                    <p className="text-[13px] text-[#4A564D]">{strat.subtitle}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[22px] font-semibold text-[#2A6A3E] tabular-nums">
                      {strat.overall_score.toFixed(1)}
                    </div>
                    <div className="text-[11px] text-[#6B786E]">/ 100 fit</div>
                  </div>
                </div>

                {/* Multi-season sequence timeline */}
                <div className="space-y-2 rounded-xl border border-[#DFDDD3] bg-[#F6F5F0] p-3">
                  <div className="text-[12px] font-medium text-[#4A564D]">
                    Suggested Multi-Season Sequence
                  </div>
                  {strat.steps.map((step, idx) => (
                    <div
                      key={`${step.slot_label}-${idx}`}
                      className="rounded-lg border border-[#DFDDD3] bg-white p-2.5 text-[12px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#1A221C] flex items-center gap-1.5">
                          <Sprout className="h-3.5 w-3.5 text-[#2A6A3E]" strokeWidth={1.5} />
                          {step.crop_name} ({step.local_name})
                        </span>
                        <StatusText
                          dot={false}
                          tone={
                            step.season === "Zaid"
                              ? "good"
                              : step.season === "Rabi"
                              ? "water"
                              : "warn"
                          }
                        >
                          {step.season}
                        </StatusText>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-[#4A564D]">
                        <span>Sow: {step.planting_window}</span>
                        <span>Harvest: {step.harvest_window}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-[#6B786E]">
                        {step.suitability_note}
                        {step.nitrogen_fixer ? " · Fixes soil nitrogen" : ""}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Why & Next Step */}
                <div className="rounded-xl border border-[#C5DBC9] bg-[#E8F0EA] p-3 text-[13px] text-[#1E522E]">
                  <div className="font-medium">Why this strategy</div>
                  <p className="mt-1">{strat.farmer_reason}</p>
                  <div className="mt-2 flex items-start gap-1.5 font-medium">
                    <ArrowRight className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={1.5} />
                    <span>{strat.farmer_next_step}</span>
                  </div>
                </div>

                {/* Benefits & Risks */}
                <div className="space-y-2 text-[12px]">
                  <div>
                    <div className="font-medium text-[#1A221C]">Potential benefits</div>
                    <ul className="mt-1 space-y-1 text-[#4A564D]">
                      {strat.benefits.map((b, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2
                            className="h-3.5 w-3.5 text-[#2A6A3E] mt-0.5 shrink-0"
                            strokeWidth={1.5}
                          />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="font-medium text-[#1A221C]">Risks & limitations</div>
                    <ul className="mt-1 space-y-1 text-[#4A564D] list-disc pl-4">
                      {strat.risks_and_limitations.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  {strat.missing_information.length > 0 ? (
                    <div className="rounded-lg border border-[#E7D4AE] bg-[#F7EFE0] p-2.5 text-[#7D4F10]">
                      <div className="font-medium">Missing info</div>
                      <ul className="mt-1 list-disc pl-4 space-y-0.5">
                        {strat.missing_information.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {/* Agronomist scoring breakdown */}
                <div className="border-t border-[#DFDDD3] pt-3 space-y-2">
                  <div className="text-[12px] font-semibold text-[#1A221C]">
                    Scoring Breakdown (Weighted)
                  </div>
                  {strat.criteria_breakdown.map((c) => (
                    <div key={c.criterion} className="text-[11px] space-y-0.5">
                      <div className="flex justify-between text-[#1A221C]">
                        <span>{c.criterion}</span>
                        <span className="font-mono tabular-nums">
                          {c.score.toFixed(0)} × {(c.weight * 100).toFixed(0)}% ={" "}
                          {c.weighted_contribution.toFixed(1)}
                        </span>
                      </div>
                      <div className="text-[#6B786E]">{c.evidence}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Disclaimer */}
      {rotations ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#DFDDD3] bg-white px-4 py-3 text-[12px] text-[#4A564D]">
          <Info className="h-4 w-4 text-[#2A6A3E] mt-0.5 shrink-0" strokeWidth={1.5} />
          <span>{rotations.disclaimer}</span>
        </div>
      ) : null}

      {/* Yearly Punjab Crop Calendar Reference */}
      {cropCalendar.length > 0 ? (
        <Card className="space-y-3">
          <div>
            <h3 className="text-[16px] font-semibold text-[#1A221C]">
              Punjab Yearly Crop Calendar Reference
            </h3>
            <p className="text-[13px] text-[#4A564D]">
              Sowing and harvest windows across Rabi (winter), Zaid (spring catch), and Kharif (monsoon/summer)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-[#DFDDD3] text-[#4A564D]">
                  <th className="py-2 pr-3 font-medium">Crop</th>
                  <th className="py-2 pr-3 font-medium">Season</th>
                  <th className="py-2 pr-3 font-medium">Planting Window</th>
                  <th className="py-2 pr-3 font-medium">Harvest Window</th>
                  <th className="py-2 pr-3 font-medium">Water Need</th>
                  <th className="py-2 pr-3 font-medium">Nitrogen Fixer</th>
                </tr>
              </thead>
              <tbody>
                {cropCalendar.map((c) => (
                  <tr key={c.id} className="border-b border-[#EEEDE6]">
                    <td className="py-2 pr-3 font-medium text-[#1A221C]">
                      {c.name} ({c.local_name})
                    </td>
                    <td className="py-2 pr-3">{c.season}</td>
                    <td className="py-2 pr-3">{c.planting_window_label}</td>
                    <td className="py-2 pr-3">{c.harvest_window_label}</td>
                    <td className="py-2 pr-3 font-mono tabular-nums">
                      {c.water_need_mm} mm ({c.water_demand_level.replace("_", " ")})
                    </td>
                    <td className="py-2 pr-3">{c.nitrogen_fixer ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
