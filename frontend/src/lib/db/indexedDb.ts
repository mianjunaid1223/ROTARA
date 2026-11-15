import { openDB, type IDBPDatabase } from "idb";
import type { SavedFieldRecord } from "@/types/rotara";

const DB_NAME = "rotara-local-db";
const DB_VERSION = 1;
const FIELDS_STORE = "fields";
const SETTINGS_STORE = "settings";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(FIELDS_STORE)) {
          db.createObjectStore(FIELDS_STORE, { keyPath: "field.id" });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
        }
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function listSavedFields(): Promise<SavedFieldRecord[]> {
  const db = await getDb();
  const rows = (await db.getAll(FIELDS_STORE)) as SavedFieldRecord[];
  return rows.sort((a, b) =>
    (b.field.updated_at || b.field.created_at || "").localeCompare(
      a.field.updated_at || a.field.created_at || ""
    )
  );
}

export async function saveFieldRecord(record: SavedFieldRecord): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.put(FIELDS_STORE, {
    ...record,
    field: {
      ...record.field,
      created_at: record.field.created_at || now,
      updated_at: now,
    },
  });
}

export async function deleteFieldRecord(fieldId: string): Promise<void> {
  const db = await getDb();
  await db.delete(FIELDS_STORE, fieldId);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = (await db.get(SETTINGS_STORE, key)) as { key: string; value: T } | undefined;
  return row ? row.value : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put(SETTINGS_STORE, { key, value });
}

export function exportFieldsAsJson(records: SavedFieldRecord[]): string {
  return JSON.stringify(
    {
      schema: "rotara-fields-v1",
      version: "rotara-fields-v1",
      format: "rotara-fields-v1",
      exported_at: new Date().toISOString(),
      fields: records,
      records,
    },
    null,
    2
  );
}

export function downloadFieldsBackup(records: SavedFieldRecord[]): void {
  const json = exportFieldsAsJson(records);
  if (typeof window === "undefined") return;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `rotara-fields-backup-${dateTag}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseFieldsBackup(rawText: string): SavedFieldRecord[] | null {
  try {
    const parsed = JSON.parse(rawText) as {
      schema?: string;
      format?: string;
      version?: string;
      fields?: SavedFieldRecord[];
      records?: SavedFieldRecord[];
    };
    const tag = parsed.schema || parsed.format || parsed.version;
    const list = Array.isArray(parsed.fields)
      ? parsed.fields
      : Array.isArray(parsed.records)
      ? parsed.records
      : null;
    if (tag !== "rotara-fields-v1" || !list) {
      return null;
    }
    return list;
  } catch {
    return null;
  }
}
