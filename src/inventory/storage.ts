import { migrateItem } from "../model/migrate";
import type {
  InventoryDocument,
  InventoryDraft,
  InventoryEntry,
} from "./types";

export const INVENTORY_KEY = "room-planner:inventory:v1";
export const INVENTORY_RECOVERY_KEY = "room-planner:inventory:recovery";
export const MAX_INVENTORY_ITEMS = 200;

function text(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    throw new Error(`Invalid ${label}.`);
  return value.trim();
}

export function validateInventoryDraft(raw: unknown): InventoryDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid furniture.");
  const value = raw as Record<string, unknown>;
  const validated = migrateItem({
    ...value,
    id: "inventory-validation",
    pos: { x: 0, y: 0 },
    rotDeg: 0,
  });
  if (
    validated.height <= 0 ||
    validated.height > 100 ||
    validated.elevation > 100
  )
    throw new Error(
      "Furniture height must be greater than zero and at most 100 m.",
    );
  const quantity = value.quantity ?? 1;
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 50
  )
    throw new Error("Quantity must be between 1 and 50.");
  let source: InventoryDraft["source"];
  if (value.source !== undefined) {
    if (
      !value.source ||
      typeof value.source !== "object" ||
      Array.isArray(value.source)
    )
      throw new Error("Invalid source link.");
    const input = value.source as Record<string, unknown>;
    const url = new URL(text(input.url, "source link", 2048));
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Source links must use HTTPS.");
    source = {
      url: url.href,
      ...(input.brand === undefined
        ? {}
        : { brand: text(input.brand, "brand", 120) }),
      ...(input.sku === undefined ? {} : { sku: text(input.sku, "SKU", 120) }),
    };
  }
  return {
    name: text(validated.name, "furniture name", 120),
    footprint: validated.footprint,
    height: validated.height,
    elevation: validated.elevation,
    color: validated.color,
    quantity,
    ...(validated.presetId ? { presetId: validated.presetId } : {}),
    ...(value.roomHint === undefined
      ? {}
      : { roomHint: text(value.roomHint, "room", 120) }),
    ...(source ? { source } : {}),
  };
}

export function validateInventoryEntry(raw: unknown): InventoryEntry {
  const draft = validateInventoryDraft(raw);
  const value = raw as Record<string, unknown>;
  const id = text(value.id, "furniture identifier");
  const createdAt = text(value.createdAt, "creation date");
  const updatedAt = text(value.updatedAt, "modification date");
  if (
    !Number.isFinite(Date.parse(createdAt)) ||
    !Number.isFinite(Date.parse(updatedAt))
  )
    throw new Error("Invalid furniture dates.");
  return { ...draft, id, createdAt, updatedAt };
}

export function parseInventory(json: string): InventoryDocument {
  if (json.length > 2 * 1024 * 1024)
    throw new Error("Furniture backups must be smaller than 2 MB.");
  const value = JSON.parse(json) as Partial<InventoryDocument>;
  if (
    !value ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_INVENTORY_ITEMS
  )
    throw new Error("Invalid furniture backup.");
  const entries = value.entries.map(validateInventoryEntry);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    throw new Error("Duplicate furniture identifiers.");
  return { version: 1, entries };
}

export function loadInventory(storage: Storage) {
  let raw: string | null = null;
  try {
    raw = storage.getItem(INVENTORY_KEY);
    return {
      entries: raw ? parseInventory(raw).entries : [],
      raw,
      error: null,
    };
  } catch {
    try {
      if (raw) storage.setItem(INVENTORY_RECOVERY_KEY, raw);
    } catch {
      /* Preserve the original when writes are unavailable. */
    }
    return {
      entries: [] as InventoryEntry[],
      raw,
      error:
        "Saved furniture could not be read. A recovery copy was retained where storage permits.",
    };
  }
}

export function writeInventory(
  storage: Storage,
  entries: InventoryEntry[],
  previousRaw: string | null,
): string {
  if (storage.getItem(INVENTORY_KEY) !== previousRaw)
    throw new Error(
      "Furniture changed in another tab. Download a backup, then reload.",
    );
  if (previousRaw) {
    try {
      parseInventory(previousRaw);
    } catch {
      // The original key must survive unless its unreadable contents are safely retained.
      try {
        storage.setItem(INVENTORY_RECOVERY_KEY, previousRaw);
      } catch {
        throw new Error(
          "Unreadable furniture could not be preserved. Download a backup before clearing device storage.",
        );
      }
    }
  }
  const raw = JSON.stringify({
    version: 1,
    entries,
  } satisfies InventoryDocument);
  storage.setItem(INVENTORY_KEY, raw);
  return raw;
}
