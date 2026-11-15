"use client";

import { useState } from "react";
import { AlertCircle, Loader2, X } from "@/components/ui/icons";
import { AdviceView } from "@/components/advice/AdviceView";
import { DataIntakeView } from "@/components/intake/DataIntakeView";
import { ExpertDetailsView } from "@/components/expert/ExpertDetailsView";
import { MyFieldsView } from "@/components/fields/MyFieldsView";
import { FarmMapCanvas } from "@/components/map/FarmMapCanvas";
import { useFieldPipeline } from "@/hooks/useFieldPipeline";
import type { FieldProfile, GeoJsonPolygon } from "@/types/rotara";

type AppTab = "map" | "fields" | "advice" | "intake" | "expert";

const TABS: { id: AppTab; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "fields", label: "Fields" },
  { id: "intake", label: "Field data" },
  { id: "advice", label: "Farmer advice" },
  { id: "expert", label: "Advanced data" },
];

export function RotaraApp() {
  const [tab, setTab] = useState<AppTab>("map");
  const [draftGeometry, setDraftGeometry] = useState<GeoJsonPolygon | null>(null);
  const [editingField, setEditingField] = useState<FieldProfile | null>(null);
  const {
    records, selectedRecord, selectedFieldId, setSelectedFieldId,
    syncingFieldId, errorBanner, setErrorBanner, saveField, removeField,
    refreshField, updatePriorities, importRecords,
  } = useFieldPipeline();

  const openIntake = (field: FieldProfile | null, geometry: GeoJsonPolygon | null) => {
    setEditingField(field);
    setDraftGeometry(geometry);
    setTab("intake");
  };

  return (
    <div className="rotara-dark rotara-app">
      <FarmMapCanvas
        visible={tab === "map"}
        records={records}
        selectedRecord={selectedRecord}
        onSelectField={(id) => { setSelectedFieldId(id); setTab("map"); }}
        onFinishPolygon={(geometry) => openIntake(null, geometry)}
      />

      <div className="rotara-topbar">
        <div className="rotara-tabs" role="tablist" aria-label="ROTARA workspace">
          {TABS.map(({ id, label }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {errorBanner && (
        <div className="rotara-error" role="alert">
          <AlertCircle className="h-4 w-4" /><span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
        </div>
      )}

      {syncingFieldId && <div className="rotara-sync"><Loader2 className="h-4 w-4 animate-spin" />Updating field observations…</div>}

      {tab !== "map" && (
        <section className={`rotara-panel rotara-panel-${tab}`}>
          {tab === "fields" && (
            <MyFieldsView
              records={records}
              selectedFieldId={selectedFieldId}
              onSelect={(id) => { setSelectedFieldId(id); setTab("map"); }}
              onEdit={(record) => openIntake(record.field, record.field.geometry)}
              onDelete={(id) => void removeField(id)}
              onAddNew={() => openIntake(null, null)}
              onImport={importRecords}
            />
          )}
          {tab === "intake" && (
            <DataIntakeView
              geometry={draftGeometry ?? editingField?.geometry ?? null}
              editingField={editingField}
              onSave={async (field, initialGeometry) => { await saveField(field, initialGeometry); setTab("advice"); }}
              onBackToMap={() => setTab("map")}
            />
          )}
          {tab === "advice" && (
            <AdviceView
              record={selectedRecord}
              syncing={syncingFieldId === selectedFieldId}
              onRefresh={refreshField}
              onGoToMap={() => setTab("map")}
            />
          )}
          {tab === "expert" && (
            <ExpertDetailsView
              record={selectedRecord}
              syncing={syncingFieldId === selectedFieldId}
              onRefresh={() => selectedRecord && refreshField(selectedRecord)}
              onEditField={() => selectedRecord && openIntake(selectedRecord.field, selectedRecord.field.geometry)}
              onUpdatePriorities={(priorities) => selectedRecord && void updatePriorities(selectedRecord, priorities)}
            />
          )}
        </section>
      )}
    </div>
  );
}
