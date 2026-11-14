"use client";

import { useEffect, useState } from "react";
import { BarChart3, FlaskConical, GitBranch, SlidersHorizontal } from "lucide-react";
import { FieldAnalysisView } from "@/components/analysis/FieldAnalysisView";
import { CropRotationsView } from "@/components/rotations/CropRotationsView";
import { ClimateSimulatorView } from "@/components/simulator/ClimateSimulatorView";
import { SoilHealthView } from "@/components/soil/SoilHealthView";
import { fetchCropCalendar } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { CropInfo, FarmerPriorities, SavedFieldRecord } from "@/types/rotara";

type ExpertSection = "environment" | "rotations" | "soil" | "simulator";

interface ExpertDetailsViewProps {
  record: SavedFieldRecord | null;
  syncing: boolean;
  onRefresh: () => void;
  onEditField: () => void;
  onUpdatePriorities: (priorities: FarmerPriorities) => void;
}

const SECTIONS: { id: ExpertSection; label: string; icon: typeof BarChart3 }[] = [
  { id: "environment", label: "Charts & Weather", icon: BarChart3 },
  { id: "rotations", label: "All 3 Plans & Scores", icon: GitBranch },
  { id: "soil", label: "Soil Dimensions", icon: FlaskConical },
  { id: "simulator", label: "Custom Stress Sliders", icon: SlidersHorizontal },
];

export function ExpertDetailsView({
  record,
  syncing,
  onRefresh,
  onEditField,
  onUpdatePriorities,
}: ExpertDetailsViewProps) {
  const [section, setSection] = useState<ExpertSection>("environment");
  const [calendar, setCalendar] = useState<CropInfo[]>([]);

  useEffect(() => {
    fetchCropCalendar()
      .then((res) => setCalendar(res.crops))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {section === "environment" && (
        <FieldAnalysisView
          record={record}
          loading={syncing}
          onRefreshAnalysis={onRefresh}
          onGoToRotations={() => setSection("rotations")}
        />
      )}

      {section === "rotations" && (
        <CropRotationsView
          record={record}
          cropCalendar={calendar}
          loading={syncing}
          onUpdatePriorities={onUpdatePriorities}
        />
      )}

      {section === "soil" && (
        <SoilHealthView record={record} onEditField={onEditField} />
      )}

      {section === "simulator" && <ClimateSimulatorView record={record} />}
    </div>
  );
}
