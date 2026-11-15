"use client";

import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  FolderKanban,
  Loader2,
  Map,
  Sprout,
  X,
} from "@/components/ui/icons";
import { AdviceView } from "@/components/advice/AdviceView";
import { DataIntakeView } from "@/components/intake/DataIntakeView";
import { ExpertDetailsView } from "@/components/expert/ExpertDetailsView";
import { MyFieldsView } from "@/components/fields/MyFieldsView";
import { FarmMapCanvas } from "@/components/map/FarmMapCanvas";
import { useFieldPipeline } from "@/hooks/useFieldPipeline";
import { estimatePolygonArea } from "@/lib/utils";
import type { FieldProfile, GeoJsonPolygon } from "@/types/rotara";

type AppTab = "map" | "intake" | "advice" | "expert" | "fields";

const TABS: { id: AppTab; label: string; icon: typeof Map }[] = [
  { id: "map", label: "1. Farm Map", icon: Map },
  { id: "intake", label: "2. Field Data", icon: ClipboardList },
  { id: "advice", label: "3. Farmer Mode", icon: Sprout },
  { id: "expert", label: "4. Advanced Mode", icon: BarChart3 },
  { id: "fields", label: "Saved Fields", icon: FolderKanban },
];

export function RotaraApp() {
  const [tab, setTab] = useState<AppTab>("map");
  const [draftGeometry, setDraftGeometry] = useState<GeoJsonPolygon | null>(null);
  const [editingField, setEditingField] = useState<FieldProfile | null>(null);
  const [drawTrigger, setDrawTrigger] = useState(0);

  const {
    records,
    selectedRecord,
    selectedFieldId,
    setSelectedFieldId,
    syncingFieldId,
    errorBanner,
    setErrorBanner,
    saveField,
    removeField,
    refreshField,
    updatePriorities,
    importRecords,
  } = useFieldPipeline();

  const openIntake = (field: FieldProfile | null, geometry: GeoJsonPolygon | null) => {
    setEditingField(field);
    setDraftGeometry(geometry);
    setTab("intake");
  };

  const handleOpenCurrentFieldIntake = () => {
    if (draftGeometry || editingField) {
      setTab("intake");
      return;
    }
    if (selectedRecord) {
      openIntake(selectedRecord.field, selectedRecord.field.geometry);
    } else {
      openIntake(null, null);
    }
  };

  const showMapWorkspace = tab === "map" || tab === "intake";
  const activeGeometry =
    tab === "intake"
      ? draftGeometry ?? editingField?.geometry ?? null
      : draftGeometry ?? editingField?.geometry ?? selectedRecord?.field.geometry ?? null;
  const intakeKey = `${editingField?.id ?? "new"}-${activeGeometry ? JSON.stringify(activeGeometry.coordinates[0]?.[0]) : "none"
    }`;

  return (
    <div className="rotara-shell">
      {/* Top Workspace Header */}
      <header className="rotara-header">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1F5E36] font-mono text-[14px] font-semibold text-white">
            R
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-[#141E16]">
            ROTARA
          </span>
        </div>

        <nav className="rotara-nav-tabs" role="tablist" aria-label="ROTARA workspace">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                if (id === "intake") {
                  handleOpenCurrentFieldIntake();
                } else {
                  setTab(id);
                }
              }}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {syncingFieldId && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#B8D4C0] bg-[#E6F0E9] px-3 py-1.5 text-[12px] font-medium text-[#164728]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Syncing NASA data...</span>
            </div>
          )}
          {records.length > 0 && (
            <select
              aria-label="Active field"
              value={selectedFieldId ?? ""}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedFieldId(nextId);
                const found = records.find((r) => r.field.id === nextId);
                if (tab === "intake" && found) {
                  setEditingField(found.field);
                  setDraftGeometry(found.field.geometry);
                }
              }}
              className="h-9 rounded-lg border border-[#D5D3C8] bg-white px-2.5 text-[13px] font-medium text-[#141E16]"
            >
              {records.map((r) => (
                <option key={r.field.id} value={r.field.id}>
                  {r.field.name} ({estimatePolygonArea(r.field.geometry).acres.toFixed(1)} ac)
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Error Alert Banner */}
      {errorBanner && (
        <div
          className="mx-auto mt-3 flex w-[min(96vw,900px)] items-center justify-between gap-3 rounded-xl border border-[#E8B8B4] bg-[#FBEAE8] px-4 py-2.5 text-[13px] font-medium text-[#8C261E]"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            aria-label="Dismiss error"
            className="rounded p-1 hover:bg-[#F5D5D1]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <main className="rotara-main">
        {/* Map + Field Data Split Workspace (Map stays mounted so switching never loses context!) */}
        <div
          className={`rotara-split-workspace ${tab === "intake" ? "mode-intake" : ""
            } ${!showMapWorkspace ? "is-hidden hidden" : ""}`}
          style={!showMapWorkspace ? { display: "none" } : undefined}
        >
          <div className="rotara-map-pane">
            <FarmMapCanvas
              visible={showMapWorkspace}
              compact={tab === "intake"}
              records={records}
              selectedRecord={selectedRecord}
              draftGeometry={tab === "intake" ? activeGeometry : null}
              externalDrawTrigger={drawTrigger}
              onSelectField={(id) => {
                setSelectedFieldId(id);
                const found = records.find((r) => r.field.id === id);
                if (tab === "intake" && found) {
                  setEditingField(found.field);
                  setDraftGeometry(found.field.geometry);
                }
              }}
              onStartNewField={() => {
                setEditingField(null);
                setDraftGeometry(null);
              }}
              onDeleteField={(id) => void removeField(id)}
              onFinishPolygon={(geometry) => {
                if (tab === "intake" && editingField) {
                  setDraftGeometry(geometry);
                } else {
                  openIntake(editingField, geometry);
                }
              }}
              onResetDraft={() => setDraftGeometry(editingField?.geometry ?? null)}
              onOpenAdvice={() => setTab("advice")}
              onOpenExpert={() => setTab("expert")}
              onEditSelectedField={() =>
                selectedRecord &&
                openIntake(selectedRecord.field, selectedRecord.field.geometry)
              }
            />
          </div>

          {tab === "intake" && (
            <div className="rotara-intake-pane">
              <DataIntakeView
                key={intakeKey}
                geometry={activeGeometry}
                editingField={editingField}
                initialPriorities={editingField ? selectedRecord?.priorities : undefined}
                onGeometryChange={(geo) => setDraftGeometry(geo)}
                onRequestDrawOnMap={() => setDrawTrigger((c) => c + 1)}
                onSave={async (field, initialGeometry, priorities) => {
                  await saveField(field, initialGeometry, priorities);
                  setDraftGeometry(null);
                  setEditingField(null);
                  setTab("advice");
                }}
                onBackToMap={() => setTab("map")}
              />
            </div>
          )}
        </div>

        {/* Non-Map Content Views */}
        {!showMapWorkspace && (
          <div className="rotara-content-pane">
            {tab === "fields" && (
              <MyFieldsView
                records={records}
                selectedFieldId={selectedFieldId}
                onSelect={(id) => {
                  setSelectedFieldId(id);
                  setTab("advice");
                }}
                onViewOnMap={(id) => {
                  setSelectedFieldId(id);
                  setTab("map");
                }}
                onEdit={(record) => openIntake(record.field, record.field.geometry)}
                onDelete={(id) => void removeField(id)}
                onAddNew={() => {
                  setEditingField(null);
                  setDraftGeometry(null);
                  setTab("map");
                  setDrawTrigger((c) => c + 1);
                }}
                onImport={importRecords}
              />
            )}

            {tab === "advice" && (
              <AdviceView
                record={selectedRecord}
                syncing={syncingFieldId === selectedFieldId}
                onRefresh={refreshField}
                onGoToMap={() => setTab("map")}
                onEditField={() =>
                  selectedRecord &&
                  openIntake(selectedRecord.field, selectedRecord.field.geometry)
                }
                onSwitchToExpert={() => setTab("expert")}
                onUpdatePriorities={(priorities) =>
                  selectedRecord && void updatePriorities(selectedRecord, priorities)
                }
              />
            )}

            {tab === "expert" && (
              <ExpertDetailsView
                record={selectedRecord}
                syncing={syncingFieldId === selectedFieldId}
                onRefresh={() => selectedRecord && refreshField(selectedRecord)}
                onEditField={() =>
                  selectedRecord &&
                  openIntake(selectedRecord.field, selectedRecord.field.geometry)
                }
                onSwitchToFarmer={() => setTab("advice")}
                onUpdatePriorities={(priorities) =>
                  selectedRecord && void updatePriorities(selectedRecord, priorities)
                }
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
