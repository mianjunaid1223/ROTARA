"use client";

import React from "react";
import { AlertCircle, CheckCircle2, FlaskConical, Satellite, Sprout } from "lucide-react";
import { Button, Card, StatusText } from "@/components/ui/primitives";
import type { SavedFieldRecord } from "@/types/rotara";

interface SoilHealthViewProps {
  record: SavedFieldRecord | null;
  onEditField: () => void;
}

function sourceBadge(sourceType: string) {
  if (sourceType === "measured_lab") {
    return <StatusText dot={false} tone="good">Measured Lab Test</StatusText>;
  }
  if (sourceType === "field_history") {
    return <StatusText dot={false} tone="water">Field History</StatusText>;
  }
  return <StatusText dot={false} tone="neutral">Satellite / Derived</StatusText>;
}

function statusTone(status: string): "good" | "warn" | "risk" | "neutral" {
  if (status === "good") return "good";
  if (status === "fair") return "warn";
  if (status === "attention") return "risk";
  return "neutral";
}

export function SoilHealthView({ record, onEditField }: SoilHealthViewProps) {
  if (!record) {
    return (
      <Card>
        <p className="text-[15px] text-[#4A564D]">
          Select or register a field first to review soil health indicators.
        </p>
      </Card>
    );
  }

  const soil = record.soilHealth;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DFDDD3] bg-white p-5">
        <div>
          <h2 className="text-[20px] font-semibold text-[#1A221C]">
            Soil Health Overview · {record.field.name}
          </h2>
          <p className="mt-1 text-[14px] text-[#4A564D]">
            {soil?.overall_farmer_summary ||
              "Loading soil health indicators from field history and satellite observations."}
          </p>
        </div>
        <Button variant="outline" onClick={onEditField}>
          <FlaskConical className="h-4 w-4" strokeWidth={1.5} />
          {soil?.measured_lab_present ? "Update Lab Results" : "Enter Soil Lab Results"}
        </Button>
      </div>

      {soil ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {soil.dimensions.map((dim) => (
              <Card key={dim.dimension} className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-[#1A221C]">
                    {dim.dimension}
                  </span>
                  <div className="flex items-center gap-3">
                    {sourceBadge(dim.source_type)}
                    <span className="text-[#DFDDD3]">·</span>
                    <StatusText tone={statusTone(dim.status)}>{dim.status}</StatusText>
                  </div>
                </div>
                <div className="font-mono text-[15px] font-medium text-[#2A6A3E] tabular-nums">
                  {dim.value_label}
                </div>
                <p className="text-[13px] text-[#4A564D] leading-relaxed">
                  {dim.technical_explanation}
                </p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {soil.cannot_conclude_without_lab.length > 0 ? (
              <Card className="space-y-3 bg-[#F7EFE0] border-[#E7D4AE]">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[#7D4F10]">
                  <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
                  What Satellites Cannot Tell Us Without a Soil Lab Test
                </div>
                <ul className="space-y-1.5 text-[13px] text-[#7D4F10] list-disc pl-5">
                  {soil.cannot_conclude_without_lab.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card className="space-y-2 bg-[#E8F0EA] border-[#C5DBC9]">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1E522E]">
                  <Satellite className="h-4 w-4" strokeWidth={1.5} />
                  Lab + Satellite Measurements Combined
                </div>
                <p className="text-[13px] text-[#1E522E]">
                  Measured laboratory test inputs are active alongside NASA and Sentinel-2 observations.
                </p>
              </Card>
            )}

            <Card className="space-y-3">
              <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1A221C]">
                <Sprout className="h-4 w-4 text-[#2A6A3E]" strokeWidth={1.5} />
                Practical Soil-Care Steps
              </div>
              <ul className="space-y-2 text-[13px] text-[#4A564D]">
                {soil.practical_actions.map((act, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2
                      className="h-4 w-4 text-[#2A6A3E] mt-0.5 shrink-0"
                      strokeWidth={1.5}
                    />
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
