"use client";

import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  FolderKanban,
  Loader2,
  Map as MapIcon,
  Sparkles,
  Sprout,
  X,
} from "lucide-react";
import { AdviceView } from "@/components/advice/AdviceView";
import { ExpertDetailsView } from "@/components/expert/ExpertDetailsView";
import { FieldRegistrationModal } from "@/components/fields/FieldRegistrationModal";
import { MyFieldsView } from "@/components/fields/MyFieldsView";
import { FarmMapCanvas } from "@/components/map/FarmMapCanvas";
import { useFieldPipeline } from "@/hooks/useFieldPipeline";
import { cn, estimatePolygonArea } from "@/lib/utils";
import type { FieldProfile, GeoJsonPolygon, NavTab } from "@/types/rotara";

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof MapIcon }[] = [
  { id: "map", label: "Map", icon: MapIcon },
  { id: "fields", label: "My Fields", icon: FolderKanban },
  { id: "advice", label: "Advice", icon: Sparkles },
  { id: "expert", label: "Expert details", icon: BarChart3 },
];

export function RotaraApp() {
  const [tab, setTab] = useState<NavTab>("map");
  const [modalOpen, setModalOpen] = useState(false);
  const [draftGeometry, setDraftGeometry] = useState<GeoJsonPolygon | null>(null);
  const [editingField, setEditingField] = useState<FieldProfile | null>(null);

  const {
    records,
    selectedRecord,
    selectedFieldId,
    setSelectedFieldId,
    backendOnline,
    syncingFieldId,
    errorBanner,
    setErrorBanner,
    saveField,
    removeField,
    refreshField,
    updatePriorities,
    importRecords,
  } = useFieldPipeline();

  const area = selectedRecord ? estimatePolygonArea(selectedRecord.field.geometry) : null;
  const syncing = syncingFieldId !== null;

  return (
    <div className="flex min-h-screen flex-col bg-[#F6F5F0] text-[#1A221C] lg:flex-row">
      {/* Left Navigation Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-[#DFDDD3] bg-white lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 border-b border-[#DFDDD3] px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2A6A3E] text-white">
            <Sprout className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-bold leading-none text-[#1A221C]">ROTARA</div>
            <div className="mt-0.5 text-xs text-[#6B786E]">Punjab Crop Helper</div>
          </div>
        </div>

        <nav className="grid grid-cols-2 gap-1.5 p-3 lg:grid-cols-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-3 text-left text-base font-semibold transition-colors",
                  active
                    ? "bg-[#2A6A3E] text-white"
                    : "text-[#313B33] hover:bg-[#EEEDE6]"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto hidden border-t border-[#DFDDD3] p-4 text-xs text-[#4A564D] lg:block">
          <div className="font-semibold text-[#1A221C]">
            {backendOnline === true
              ? "Server ready"
              : backendOnline === false
              ? "Server offline"
              : "Checking server..."}
          </div>
          {records.length > 0 && (
            <div className="mt-1">
              {records.length} field{records.length === 1 ? "" : "s"} saved on this computer
            </div>
          )}
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Status Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DFDDD3] bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            {selectedRecord ? (
              <>
                <span className="text-base font-bold text-[#1A221C]">
                  {selectedRecord.field.name}
                </span>
                {area && (
                  <span className="text-sm text-[#4A564D]">
                    {area.acres.toFixed(1)} acres ({area.kanals.toFixed(0)} kanals)
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-[#4A564D]">
                Draw your field on the map to get crop advice
              </span>
            )}
          </div>

          {syncing && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
              Getting satellite data...
            </div>
          )}
        </header>

        {errorBanner && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-2.5 text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              aria-label="Dismiss error"
              className="rounded p-1 hover:bg-amber-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Map View stays mounted so draw state and tiles never reset */}
        <main className="flex-1 p-4 lg:p-5">
          <div className={tab === "map" ? "h-[calc(100vh-120px)] min-h-[520px]" : "hidden"}>
            <FarmMapCanvas
              visible={tab === "map"}
              records={records}
              selectedRecord={selectedRecord}
              onSelectField={(id) => setSelectedFieldId(id)}
              onFinishPolygon={(geometry) => {
                setEditingField(null);
                setDraftGeometry(geometry);
                setModalOpen(true);
              }}
              onOpenAdvice={() => setTab("advice")}
            />
          </div>

          {tab === "fields" && (
            <MyFieldsView
              records={records}
              selectedFieldId={selectedFieldId}
              onSelect={(id) => {
                setSelectedFieldId(id);
                setTab("advice");
              }}
              onEdit={(rec) => {
                setEditingField(rec.field);
                setDraftGeometry(rec.field.geometry);
                setModalOpen(true);
              }}
              onDelete={(id) => void removeField(id)}
              onAddNew={() => setTab("map")}
              onImport={importRecords}
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
              onEditField={() => {
                if (!selectedRecord) return;
                setEditingField(selectedRecord.field);
                setDraftGeometry(selectedRecord.field.geometry);
                setModalOpen(true);
              }}
              onUpdatePriorities={(p) =>
                selectedRecord && void updatePriorities(selectedRecord, p)
              }
            />
          )}
        </main>
      </div>

      <FieldRegistrationModal
        key={editingField?.id ?? (modalOpen ? "new-open" : "closed")}
        open={modalOpen}
        onOpenChange={setModalOpen}
        initialGeometry={draftGeometry}
        editingField={editingField}
        onSave={saveField}
      />
    </div>
  );
}
