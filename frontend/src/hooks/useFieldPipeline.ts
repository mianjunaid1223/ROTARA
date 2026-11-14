"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzeFieldEnvironment,
  checkBackendHealth,
  evaluateSoilHealthApi,
  fetchRotationRecommendations,
} from "@/lib/api/client";
import {
  deleteFieldRecord,
  getSetting,
  listSavedFields,
  saveFieldRecord,
  setSetting,
} from "@/lib/db/indexedDb";
import type {
  FarmerPriorities,
  FieldProfile,
  GeoJsonPolygon,
  SavedFieldRecord,
} from "@/types/rotara";

export const DEFAULT_PRIORITIES: FarmerPriorities = {
  water_conservation: 4,
  soil_improvement: 4,
  market_suitability: 3,
  climate_resilience: 4,
};

function sanitizePriorities(p?: FarmerPriorities | null): FarmerPriorities {
  if (!p) return DEFAULT_PRIORITIES;
  const fix = (val: number, fallback: number) =>
    Number.isInteger(val) && val >= 1 && val <= 5 ? val : fallback;
  return {
    water_conservation: fix(p.water_conservation, DEFAULT_PRIORITIES.water_conservation),
    soil_improvement: fix(p.soil_improvement, DEFAULT_PRIORITIES.soil_improvement),
    market_suitability: fix(p.market_suitability, DEFAULT_PRIORITIES.market_suitability),
    climate_resilience: fix(p.climate_resilience, DEFAULT_PRIORITIES.climate_resilience),
  };
}

export function useFieldPipeline() {
  const [records, setRecords] = useState<SavedFieldRecord[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [syncingFieldId, setSyncingFieldId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const revisionsRef = useRef<Record<string, number>>({});
  const deletedRef = useRef<Set<string>>(new Set());

  const selectedRecord = records.find((r) => r.field.id === selectedFieldId) ?? null;

  const isStale = useCallback(
    (fieldId: string, revision: number) =>
      deletedRef.current.has(fieldId) || revisionsRef.current[fieldId] !== revision,
    []
  );

  const runPipeline = useCallback(
    async (field: FieldProfile, priorities: FarmerPriorities) => {
      deletedRef.current.delete(field.id);
      const rev = (revisionsRef.current[field.id] ?? 0) + 1;
      revisionsRef.current[field.id] = rev;

      setSyncingFieldId(field.id);
      setErrorBanner(null);
      try {
        const analysis = await analyzeFieldEnvironment(field);
        if (isStale(field.id, rev)) return;

        const [rotations, soilHealth] = await Promise.all([
          fetchRotationRecommendations({ field, priorities, analysis }),
          evaluateSoilHealthApi(field, analysis),
        ]);
        if (isStale(field.id, rev)) return;

        const updated: SavedFieldRecord = {
          field,
          area: analysis.geometry_summary,
          analysis,
          rotations,
          soilHealth,
          priorities,
        };
        await saveFieldRecord(updated);
        if (isStale(field.id, rev)) return;

        setRecords((prev) =>
          prev.some((r) => r.field.id === field.id)
            ? prev.map((r) => (r.field.id === field.id ? updated : r))
            : [updated, ...prev]
        );
        setBackendOnline(true);
      } catch (err) {
        if (!isStale(field.id, rev)) {
          setErrorBanner(
            err instanceof Error
              ? err.message
              : "Could not get satellite data. Your field is saved and you can retry."
          );
        }
      } finally {
        if (!isStale(field.id, rev)) setSyncingFieldId(null);
      }
    },
    [isStale]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [saved, savedId] = await Promise.all([
          listSavedFields(),
          getSetting<string | null>("selectedFieldId", null),
        ]);
        if (!active) return;
        const normalized = saved.map((r) => ({ ...r, priorities: sanitizePriorities(r.priorities) }));
        setRecords(normalized);
        if (savedId && normalized.some((r) => r.field.id === savedId)) {
          setSelectedFieldId(savedId);
        } else if (normalized[0]) {
          setSelectedFieldId(normalized[0].field.id);
        }
      } catch {
        if (active) setErrorBanner("Failed to read saved fields on this device.");
      }
      try {
        await checkBackendHealth();
        if (active) setBackendOnline(true);
      } catch {
        if (active) setBackendOnline(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void setSetting("selectedFieldId", selectedFieldId);
  }, [selectedFieldId]);

  const saveField = useCallback(
    async (field: FieldProfile, initialGeometry?: GeoJsonPolygon) => {
      const existing = records.find((r) => r.field.id === field.id);
      const priorities = sanitizePriorities(existing?.priorities);
      const keepAnalysis =
        existing?.analysis &&
        (!initialGeometry ||
          JSON.stringify(existing.field.geometry) === JSON.stringify(initialGeometry));

      const immediate: SavedFieldRecord = {
        field,
        area: keepAnalysis ? existing?.area : undefined,
        analysis: keepAnalysis ? existing?.analysis : undefined,
        rotations: keepAnalysis ? existing?.rotations : undefined,
        soilHealth: keepAnalysis ? existing?.soilHealth : undefined,
        priorities,
      };
      await saveFieldRecord(immediate);
      setRecords((prev) =>
        prev.some((r) => r.field.id === field.id)
          ? prev.map((r) => (r.field.id === field.id ? immediate : r))
          : [immediate, ...prev]
      );
      setSelectedFieldId(field.id);
      void runPipeline(field, priorities);
    },
    [records, runPipeline]
  );

  const removeField = useCallback(
    async (fieldId: string) => {
      deletedRef.current.add(fieldId);
      await deleteFieldRecord(fieldId);
      setRecords((prev) => {
        const next = prev.filter((r) => r.field.id !== fieldId);
        if (selectedFieldId === fieldId) {
          setSelectedFieldId(next[0]?.field.id ?? null);
        }
        return next;
      });
    },
    [selectedFieldId]
  );

  const updatePriorities = useCallback(
    async (record: SavedFieldRecord, nextPriorities: FarmerPriorities) => {
      if (!record.analysis) return;
      try {
        const rotations = await fetchRotationRecommendations({
          field: record.field,
          priorities: nextPriorities,
          analysis: record.analysis,
        });
        const updated: SavedFieldRecord = { ...record, priorities: nextPriorities, rotations };
        await saveFieldRecord(updated);
        setRecords((prev) => prev.map((r) => (r.field.id === record.field.id ? updated : r)));
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : "Failed to update crop plan.");
      }
    },
    []
  );

  const importRecords = useCallback(async (incoming: SavedFieldRecord[]) => {
    for (const rec of incoming) await saveFieldRecord(rec);
    const refreshed = await listSavedFields();
    setRecords(refreshed);
    if (refreshed[0]) setSelectedFieldId(refreshed[0].field.id);
  }, []);

  return {
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
    refreshField: (rec: SavedFieldRecord) => void runPipeline(rec.field, rec.priorities),
    updatePriorities,
    importRecords,
  };
}
