"use client";

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CloudRain,
  Droplets,
  Leaf,
  Mountain,
  RefreshCw,
  ThermometerSun,
} from "@/components/ui/icons";
import { Button, Card, StatusText } from "@/components/ui/primitives";
import { formatCropLabel } from "@/lib/utils";
import type {
  EnvironmentalAnalysisResponse,
  SavedFieldRecord,
} from "@/types/rotara";

interface FieldAnalysisViewProps {
  record: SavedFieldRecord | null;
  loading: boolean;
  onRefreshAnalysis: () => void;
  onGoToRotations: () => void;
}

function moistureTone(status: string): "good" | "water" | "warn" | "risk" | "neutral" {
  if (status === "adequate") return "good";
  if (status === "wet") return "water";
  if (status === "dry") return "warn";
  if (status === "very_dry") return "risk";
  return "neutral";
}

function vegetationTone(status: string): "good" | "warn" | "risk" | "neutral" {
  if (status === "vigorous") return "good";
  if (status === "moderate") return "warn";
  if (status === "stressed" || status === "bare_or_fallow") return "risk";
  return "neutral";
}

export function FieldAnalysisView({
  record,
  loading,
  onRefreshAnalysis,
  onGoToRotations,
}: FieldAnalysisViewProps) {
  if (!record) {
    return (
      <Card>
        <p className="text-[15px] text-[#4A564D]">
          Register or select a field on the Farm Map first to load NASA observations.
        </p>
      </Card>
    );
  }

  const analysis: EnvironmentalAnalysisResponse | undefined = record.analysis;
  const area = analysis?.geometry_summary ?? record.area;

  return (
    <div className="space-y-5">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DFDDD3] bg-white p-5">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[20px] font-semibold text-[#1A221C]">
              {record.field.name}
            </h2>
            {area ? (
              <span className="font-mono text-[12px] tabular-nums text-[#2A6A3E]">
                {area.area_acres} acres ({area.area_hectares} ha)
              </span>
            ) : null}
            {area ? (
              <span className="text-[12px] text-[#6B786E]">{area.agro_zone_name}</span>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] text-[#4A564D]">
            Current crop: {formatCropLabel(record.field.current_crop)}
            {record.field.previous_crop
              ? ` · Previous: ${formatCropLabel(record.field.previous_crop)}`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={onRefreshAnalysis}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              strokeWidth={1.5}
            />
            {loading ? "Loading NASA Data..." : "Refresh NASA Data"}
          </Button>
          <Button variant="primary" size="md" onClick={onGoToRotations}>
            View Crop Rotations
          </Button>
        </div>
      </div>

      {!analysis ? (
        <Card className="space-y-3">
          <p className="text-[15px] text-[#1A221C] font-medium">
            {loading
              ? "Fetching NASA POWER weather, Sentinel-2 / Landsat greenness, and SRTM terrain data..."
              : "Environmental observations have not been loaded for this field yet."}
          </p>
          {!loading ? (
            <Button variant="primary" onClick={onRefreshAnalysis}>
              Run Environmental Analysis
            </Button>
          ) : null}
        </Card>
      ) : (
        <>
          {record.rotations?.strategies[0] ? (
            <div className="rounded-2xl border border-[#C5DBC9] bg-[#E8F0EA] px-5 py-4 text-[#1E522E] flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold">
                  Top Plan ({record.rotations.strategies[0].title})
                </div>
                <p className="mt-0.5 text-[14px]">
                  {record.rotations.strategies[0].farmer_next_step}
                </p>
              </div>
              <Button size="sm" variant="primary" onClick={onGoToRotations}>
                Compare Rotations
              </Button>
            </div>
          ) : null}

          {/* Top KPI indicators */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#4A564D]">
                  <Droplets className="h-4 w-4 text-[#25647C]" strokeWidth={1.5} />
                  Water & Moisture
                </span>
                <StatusText tone={moistureTone(analysis.water.moisture_proxy_status)}>
                  {analysis.water.moisture_proxy_status.replace("_", " ")}
                </StatusText>
              </div>
              <div className="text-[24px] font-semibold font-mono tabular-nums text-[#1A221C]">
                {analysis.water.rainfall_30d_mm !== null &&
                analysis.water.rainfall_30d_mm !== undefined
                  ? `${analysis.water.rainfall_30d_mm.toFixed(0)} mm`
                  : "Unavailable"}
              </div>
              <p className="text-[13px] text-[#4A564D] leading-relaxed">
                {analysis.water.agronomist_summary}
              </p>
            </Card>

            <Card className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#4A564D]">
                  <ThermometerSun className="h-4 w-4 text-[#9A6318]" strokeWidth={1.5} />
                  Temperature & Heat
                </span>
                <StatusText
                  tone={
                    (analysis.climate.heat_stress_days_90d ?? 0) >= 12 ? "warn" : "neutral"
                  }
                >
                  <span className="font-mono tabular-nums">
                    {analysis.climate.heat_stress_days_90d ?? 0} hot days
                  </span>
                </StatusText>
              </div>
              <div className="text-[24px] font-semibold font-mono tabular-nums text-[#1A221C]">
                {analysis.climate.temp_mean_30d_c !== null &&
                analysis.climate.temp_mean_30d_c !== undefined
                  ? `${analysis.climate.temp_mean_30d_c.toFixed(1)} °C`
                  : "Unavailable"}
              </div>
              <p className="text-[13px] text-[#4A564D] leading-relaxed">
                {analysis.climate.agronomist_summary}
              </p>
            </Card>

            <Card className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#4A564D]">
                  <Leaf className="h-4 w-4 text-[#2A6A3E]" strokeWidth={1.5} />
                  Vegetation Cover
                </span>
                <StatusText tone={vegetationTone(analysis.vegetation.vegetation_status)}>
                  {analysis.vegetation.vegetation_status.replaceAll("_", " ")}
                </StatusText>
              </div>
              <div className="text-[24px] font-semibold font-mono tabular-nums text-[#1A221C]">
                {analysis.vegetation.latest_ndvi !== null &&
                analysis.vegetation.latest_ndvi !== undefined
                  ? `NDVI ${analysis.vegetation.latest_ndvi.toFixed(2)}`
                  : "Cloud-covered"}
              </div>
              <p className="text-[13px] text-[#4A564D] leading-relaxed">
                {analysis.vegetation.agronomist_summary}
              </p>
            </Card>

            <Card className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-[#4A564D]">
                  <Mountain className="h-4 w-4 text-[#6B786E]" strokeWidth={1.5} />
                  Terrain & Slope
                </span>
                <StatusText
                  tone={
                    analysis.terrain.erosion_risk === "low"
                      ? "good"
                      : analysis.terrain.erosion_risk === "moderate"
                      ? "warn"
                      : "risk"
                  }
                >
                  {analysis.terrain.erosion_risk} runoff
                </StatusText>
              </div>
              <div className="text-[24px] font-semibold font-mono tabular-nums text-[#1A221C]">
                {analysis.terrain.slope_mean_pct !== null &&
                analysis.terrain.slope_mean_pct !== undefined
                  ? `${analysis.terrain.slope_mean_pct.toFixed(1)}% slope`
                  : "Unavailable"}
              </div>
              <p className="text-[13px] text-[#4A564D] leading-relaxed">
                {analysis.terrain.agronomist_summary}
              </p>
            </Card>
          </div>

          {/* Primary Rainfall & ET0 Chart + NDVI/Temp Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#1A221C] flex items-center gap-2">
                    <CloudRain className="h-4 w-4 text-[#25647C]" strokeWidth={1.5} />
                    Rainfall vs Crop Water Demand (Last 90 Days)
                  </h3>
                  <p className="text-[12px] text-[#6B786E]">
                    Daily rainfall (mm) from NASA POWER compared with reference evaporation ET0 (mm)
                  </p>
                </div>
                <span className="font-mono text-[11px] text-[#6B786E]">
                  NASA POWER 0.5x0.625 deg
                </span>
              </div>

              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={analysis.weather_series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DA" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#6B786E" }}
                      tickFormatter={(v: string) => v.slice(5)}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B786E" }}
                      unit=" mm"
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#FFFFFF",
                        borderColor: "#DFDDD3",
                        borderRadius: "10px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar
                      dataKey="rainfall_mm"
                      name="Rainfall (mm)"
                      fill="#25647C"
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="et0_mm"
                      name="Evaporation ET0 (mm)"
                      stroke="#9A6318"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="space-y-3">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1A221C]">
                  Field Greenness (NDVI)
                </h3>
                <p className="text-[12px] text-[#6B786E]">
                  Cloud-filtered Sentinel-2 (10m) & Landsat (30m)
                </p>
              </div>
              {analysis.ndvi_series.length > 0 ? (
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analysis.ndvi_series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DA" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#6B786E" }}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis
                        domain={[0, 1]}
                        tick={{ fontSize: 11, fill: "#6B786E" }}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          borderColor: "#DFDDD3",
                          borderRadius: "10px",
                          fontSize: "12px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="ndvi_mean"
                        name="NDVI"
                        stroke="#2A6A3E"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "#2A6A3E" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[220px] items-center justify-center rounded-xl border border-[#DFDDD3] bg-[#F6F5F0] p-4 text-center text-[13px] text-[#4A564D]">
                  No cloud-free Sentinel-2 or Landsat scenes passed the cloud filter in this window.
                </div>
              )}
            </Card>
          </div>

          {/* Agronomist Temperature & Data Source Transparency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="space-y-3">
                <h3 className="text-[16px] font-semibold text-[#1A221C]">
                  Daily Temperature Range (T2M Mean & Max, °C)
                </h3>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analysis.weather_series.slice(-45)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E3DA" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: "#6B786E" }}
                        tickFormatter={(v: string) => v.slice(5)}
                        minTickGap={18}
                      />
                      <YAxis tick={{ fontSize: 11, fill: "#6B786E" }} unit="°C" width={44} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          borderColor: "#DFDDD3",
                          borderRadius: "10px",
                          fontSize: "12px",
                        }}
                      />
                      <Bar dataKey="temp_max_c" name="Max Temp (°C)" fill="#C4822B" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="temp_mean_c" name="Mean Temp (°C)" fill="#2A6A3E" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="space-y-3">
                <h3 className="text-[16px] font-semibold text-[#1A221C]">
                  Dataset Provenance & Availability
                </h3>
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {analysis.data_sources.map((src) => (
                    <div
                      key={src.id}
                      className="rounded-xl border border-[#DFDDD3] bg-[#F6F5F0] p-3 text-[12px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[#1A221C]">{src.name}</span>
                        <StatusText
                          tone={
                            src.status === "available"
                              ? "good"
                              : src.status === "partial"
                              ? "warn"
                              : "neutral"
                          }
                        >
                          {src.status}
                        </StatusText>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-[#4A564D]">
                        {src.category.replace("_", " ")} · {src.spatial_resolution}
                        {src.latest_date ? ` · Latest: ${src.latest_date}` : ""}
                      </div>
                      <p className="mt-1 text-[#4A564D]">{src.limitations}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

          {/* Honest Scientific Limitations */}
          <Card className="space-y-3 bg-[#F6F5F0]">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-[#1A221C]">
              <AlertTriangle className="h-4 w-4 text-[#9A6318]" strokeWidth={1.5} />
              What These Observations Tell Us (and What They Do Not)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {analysis.limitations.map((lim) => (
                <div
                  key={lim.topic}
                  className="rounded-xl border border-[#DFDDD3] bg-white p-3.5 text-[13px]"
                >
                  <div className="font-medium text-[#1A221C]">{lim.topic}</div>
                  <p className="mt-1 text-[#4A564D]">
                    {lim.technical_note}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
