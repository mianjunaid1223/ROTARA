"use client";

import { useRef, useState } from "react";
import { Download, FolderOpen, Pencil, Plus, Trash2, Upload } from "@/components/ui/icons";
import { CropImage } from "@/components/ui/CropImage";
import { Button, Card } from "@/components/ui/primitives";
import { exportFieldsAsJson } from "@/lib/db/indexedDb";
import { estimatePolygonArea, formatCropLabel } from "@/lib/utils";
import type { SavedFieldRecord } from "@/types/rotara";

interface MyFieldsViewProps {
  records: SavedFieldRecord[];
  selectedFieldId: string | null;
  onSelect: (fieldId: string) => void;
  onEdit: (record: SavedFieldRecord) => void;
  onDelete: (fieldId: string) => void;
  onAddNew: () => void;
  onImport: (records: SavedFieldRecord[]) => Promise<void>;
}

export function MyFieldsView({
  records,
  selectedFieldId,
  onSelect,
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
      const parsed = JSON.parse(await file.text()) as {
        schema?: string;
        fields?: SavedFieldRecord[];
      };
      if (parsed.schema !== "rotara-fields-v1" || !Array.isArray(parsed.fields)) {
        setImportMsg("Invalid backup file.");
        return;
      }
      await onImport(parsed.fields);
      setImportMsg(`Loaded ${parsed.fields.length} field(s).`);
    } catch {
      setImportMsg("Could not read backup file.");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-stone-900">My Fields</h2>
          <p className="text-sm text-stone-600">
            Fields are saved on this computer. Pick one to see map or advice.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onAddNew}>
            <Plus className="h-4 w-4" />
            Add Field on Map
          </Button>
          {records.length > 0 && (
            <Button variant="outline" onClick={() => exportFieldsAsJson(records)}>
              <Download className="h-4 w-4" />
              Backup
            </Button>
          )}
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Restore
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
        <div className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-800">
          {importMsg}
        </div>
      )}

      {records.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-base text-stone-700">No fields saved yet.</p>
          <Button variant="primary" className="mt-4" onClick={onAddNew}>
            Draw Your First Field
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {records.map((rec) => {
            const area = estimatePolygonArea(rec.field.geometry);
            const active = rec.field.id === selectedFieldId;
            return (
              <Card
                key={rec.field.id}
                className={`p-4 ${active ? "border-emerald-700 ring-1 ring-emerald-700" : ""}`}
              >
                <div className="flex items-start gap-3.5">
                  <CropImage
                    cropId={rec.field.current_crop}
                    alt={rec.field.current_crop}
                    size={64}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-bold text-stone-900">{rec.field.name}</h3>
                    <div className="text-sm font-medium text-stone-700">
                      {area.acres.toFixed(1)} acres ({area.kanals.toFixed(0)} kanals)
                    </div>
                    <div className="mt-0.5 text-sm text-stone-600">
                      Growing now: {formatCropLabel(rec.field.current_crop)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                  <Button
                    variant={active ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => onSelect(rec.field.id)}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {active ? "Open (Selected)" : "Open Field"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onEdit(rec)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(rec.field.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-700" />
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
