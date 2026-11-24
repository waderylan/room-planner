import { create } from "zustand";
import type { Item, Unit } from "../model/types";
import { convertItem } from "../model/units";
import { downloadFile } from "../lib/files";
import {
  loadInventory,
  MAX_INVENTORY_ITEMS,
  parseInventory,
  validateInventoryDraft,
  writeInventory,
} from "./storage";
import type { InventoryDraft, InventoryEntry } from "./types";

interface InventoryState {
  entries: InventoryEntry[];
  saveStatus: "saved" | "error";
  saveError: string | null;
  saveEntry: (draft: InventoryDraft, id?: string) => InventoryEntry | null;
  removeEntry: (id: string) => void;
  saveItem: (
    item: Item,
    unit: Unit,
    roomHint?: string,
  ) => InventoryEntry | null;
  importInventory: (json: string) => boolean;
  exportInventory: () => void;
  retrySave: () => boolean;
}

export const useInventoryStore = create<InventoryState>()((set, get) => {
  let loaded: ReturnType<typeof loadInventory>;
  try {
    loaded = loadInventory(localStorage);
  } catch {
    loaded = {
      entries: [],
      raw: null,
      error:
        "Device storage is unavailable. Download furniture backups before closing.",
    };
  }
  let previousRaw = loaded.raw;
  function persist(): boolean {
    try {
      previousRaw = writeInventory(localStorage, get().entries, previousRaw);
      set({ saveStatus: "saved", saveError: null });
      return true;
    } catch (error) {
      set({
        saveStatus: "error",
        saveError:
          error instanceof Error
            ? error.message
            : "Furniture could not be saved on this device.",
      });
      return false;
    }
  }
  return {
    entries: loaded.entries,
    saveStatus: loaded.error ? "error" : "saved",
    saveError: loaded.error,
    saveEntry: (value, id) => {
      try {
        const draft = validateInventoryDraft(value);
        const existing = id
          ? get().entries.find((entry) => entry.id === id)
          : undefined;
        if (id && !existing)
          throw new Error("This furniture item no longer exists.");
        if (!existing && get().entries.length >= MAX_INVENTORY_ITEMS)
          throw new Error("The furniture library can contain up to 200 items.");
        const now = new Date().toISOString();
        const entry: InventoryEntry = {
          ...structuredClone(draft),
          id: existing?.id ?? crypto.randomUUID(),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        set({
          entries: existing
            ? get().entries.map((current) =>
                current.id === entry.id ? entry : current,
              )
            : [...get().entries, entry],
        });
        persist();
        return entry;
      } catch (error) {
        set({
          saveStatus: "error",
          saveError:
            error instanceof Error
              ? error.message
              : "Furniture could not be saved.",
        });
        return null;
      }
    },
    removeEntry: (id) => {
      set({ entries: get().entries.filter((entry) => entry.id !== id) });
      persist();
    },
    saveItem: (item, unit, roomHint) => {
      const metric = convertItem(item, unit, "m");
      return get().saveEntry({
        name: metric.name,
        footprint: metric.footprint,
        height: metric.height,
        elevation: metric.elevation,
        color: metric.color,
        quantity: 1,
        ...(metric.presetId ? { presetId: metric.presetId } : {}),
        ...(roomHint ? { roomHint } : {}),
      });
    },
    importInventory: (json) => {
      try {
        const ids = new Set(get().entries.map((entry) => entry.id));
        // Stable asset IDs reconnect restored design backups to the same owned pieces.
        // Never overwrite a newer local record merely because an old backup was imported.
        const imported = parseInventory(json).entries.filter(
          (entry) => !ids.has(entry.id),
        );
        if (get().entries.length + imported.length > MAX_INVENTORY_ITEMS)
          throw new Error("The furniture library can contain up to 200 items.");
        set({ entries: [...get().entries, ...structuredClone(imported)] });
        persist();
        return true;
      } catch (error) {
        set({
          saveStatus: "error",
          saveError:
            error instanceof Error
              ? error.message
              : "Furniture backup could not be imported.",
        });
        return false;
      }
    },
    exportInventory: () =>
      downloadFile(
        JSON.stringify({ version: 1, entries: get().entries }, null, 2),
        "my-furniture.json",
        "application/json",
      ),
    retrySave: persist,
  };
});
