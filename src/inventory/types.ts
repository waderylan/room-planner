import type { Footprint } from "../model/types";

/** Physical measurements in this library are always meters. Room instances are snapshots. */
export interface InventoryDraft {
  name: string;
  footprint: Footprint;
  height: number;
  elevation: number;
  color: string;
  quantity: number;
  presetId?: string;
  roomHint?: string;
  source?: { url: string; brand?: string; sku?: string };
}

export interface InventoryEntry extends InventoryDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryDocument {
  version: 1;
  entries: InventoryEntry[];
}
