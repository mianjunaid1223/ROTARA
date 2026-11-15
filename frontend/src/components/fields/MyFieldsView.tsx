"use client";

import { useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "@/components/ui/icons";
import { CropImage } from "@/components/ui/CropImage";
import { Button, Card, StatusText } from "@/components/ui/primitives";
import { downloadFieldsBackup, parseFieldsBackup } from "@/lib/db/indexedDb";
import { estimatePolygonArea, formatCropLabel } from "@/lib/utils";
import type { SavedFieldRecord } from "@/types/rotara";

interface MyFieldsViewProps {
  records: SavedFieldRecord[];
  selectedFieldId: string | null;
  onSelect: (fieldId: string) => void;
  onViewOnMap?: (fieldId: string) => void;
  onEdit: (record: SavedFieldRecord) => void;
  onDelete: (fieldId: string) => void;
  onAddNew: () => void;
  onImport: (records: SavedFieldRecord[]) => Promise<void>;
}

export function MyFieldsView({
  records,
  selectedFieldId,
  onSelect,
  onViewOnMap,
  onEdit,
  onDelete,
  onAddNew,
  onImport,
}: MyFieldsViewProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const restored = parseFieldsBackup(text);
      if (!restored) {
        setImportMsg("Invalid backup file format.");
        return;
      }
      await onImport(restored);
      setImportMsg(`Restored ${restored.length} field(s) from backup.`);
    } catch {
      setImportMsg("Could not read backup file.");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D5D3C8] bg-white p-5">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-[#1F5E36]">
            Local Field Registry
          </div>
          <h1 className="mt-0.5 text-[22px] font-semibold text-[#141E16]">Saved Fields</h1>
          <p className="mt-1 text-[14px] text-[#38473B]">
            Fields and satellite analyses are stored locally on this device. Select a field to inspect its rotation plan or export a backup.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onAddNew}>
            <Plus className="h-4 w-4" />
            Draw New Field on Map
          </Button>
          {records.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                downloadFieldsBackup(records);
                setImportMsg(`Downloaded backup of ${records.length} field(s).`);
              }}
            >
              <Download className="h-4 w-4" />
              Export Backup
            </Button>
          )}
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Restore Backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleRestore(e)}
            className="hidden"
          />
        </div>
      </div>

      {importMsg && (
        <div className="rounded-xl border border-[#B8D4C0] bg-[#E6F0E9] px-4 py-2.5 text-[13px] font-medium text-[#164728]">
          {importMsg}
        </div>
      )}

      {records.length === 0 ? (
        <Card className="py-12 text-center">
          <MapPin className="mx-auto h-10 w-10 text-[#1F5E36]" />
          <h2 className="mt-3 text-[18px] font-semibold text-[#141E16]">
            No fields registered yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] text-[#38473B]">
            Start on the Farm Map to draw your field corners or enter coordinates.
          </p>
          <Button variant="primary" className="mt-5" onClick={onAddNew}>
            Draw Your First Field
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {records.map((rec) => {
            const area = estimatePolygonArea(rec.field.geometry);
            const active = rec.field.id === selectedFieldId;
            const topNextCrop = rec.rotations?.strategies[0]?.steps[0];
            return (
              <Card
                key={rec.field.id}
                className={
                  active
                    ? "border-[#1F5E36] ring-2 ring-[#1F5E36]"
                    : "border-[#D5D3C8]"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <CropImage
                      cropId={rec.field.current_crop}
                      alt={rec.field.current_crop}
                      size={64}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-[17px] font-semibold text-[#141E16]">
                          {rec.field.name}
                        </h3>
                        {active && <StatusText tone="good">Active</StatusText>}
                      </div>
                      <div className="mt-0.5 font-mono text-[13px] font-semibold text-[#1F5E36] tabular-nums">
                        {area.acres.toFixed(1)} acres ({area.kanals.toFixed(0)} kanals · {area.hectares.toFixed(2)} ha)
                      </div>
                      <div className="mt-1 text-[13px] text-[#38473B]">
                        Growing now: <strong className="font-medium text-[#141E16]">{formatCropLabel(rec.field.current_crop)}</strong>
                      </div>
                      <div className="text-[12px] text-[#5A6B5D]">
                        Previous: {formatCropLabel(rec.field.previous_crop)} · Water: {rec.field.water_availability}
                      </div>
                    </div>
                  </div>
                </div>

                {topNextCrop && (
                  <div className="mt-3.5 flex items-center justify-between rounded-lg border border-[#E4E2D8] bg-[#F8F7F3] px-3 py-2 text-[12px]">
                    <div className="flex items-center gap-2">
                      <CropImage
                        cropId={topNextCrop.crop_id}
                        alt={topNextCrop.crop_name}
                        size={32}
                      />
                      <div>
                        <span className="text-[#5A6B5D]">Recommended next: </span>
                        <strong className="text-[#141E16]">
                          {topNextCrop.crop_name} ({topNextCrop.local_name})
                        </strong>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-[#1F5E36] tabular-nums">
                      {rec.rotations?.strategies[0]?.overall_score.toFixed(1)}/100
                    </span>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E4E2D8] pt-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onSelect(rec.field.id)}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Open Advice
                  </Button>
                  {onViewOnMap && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onViewOnMap(rec.field.id)}
                    >
                      <MapPin className="h-4 w-4" />
                      View on Map
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => onEdit(rec)}>
                    <Pencil className="h-4 w-4" />
                    Edit Setup
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => onDelete(rec.field.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
