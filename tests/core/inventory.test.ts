import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoom } from "../../src/model/factory";
import { convertItem } from "../../src/model/units";
import { safeParseDoc } from "../../src/model/migrate";
import {
  INVENTORY_KEY,
  INVENTORY_RECOVERY_KEY,
  loadInventory,
  parseInventory,
  validateInventoryDraft,
  writeInventory,
} from "../../src/inventory/storage";
import { itemFromInventory } from "../../src/inventory/comparison";
import type { InventoryEntry } from "../../src/inventory/types";

const entry: InventoryEntry = {
  id: "owned-sofa",
  name: "My sofa",
  footprint: { kind: "rect", w: 2, d: 0.9 },
  height: 0.8,
  elevation: 0,
  color: "#8a8f98",
  quantity: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  source: { url: "https://www.ikea.com/us/en/p/sofa/" },
};
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

test("inventory validates physical data, quantity, and source URLs before saving", () => {
  const draft = validateInventoryDraft(entry);
  assert.equal(draft.name, "My sofa");
  assert.deepEqual(draft.footprint, { kind: "rect", w: 2, d: 0.9 });
  for (const patch of [
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: 51 },
    { height: NaN },
    { height: 0 },
    { footprint: { kind: "rect", w: -1, d: 0.9 } },
    { source: { url: "javascript:alert(1)" } },
    { source: { url: "https://user:secret@example.com/" } },
  ])
    assert.throws(() => validateInventoryDraft({ ...entry, ...patch }));
});

test("inventory backup round trips and rejects duplicate identifiers", () => {
  assert.deepEqual(
    parseInventory(JSON.stringify({ version: 1, entries: [entry] })).entries[0],
    entry,
  );
  assert.throws(() =>
    parseInventory(JSON.stringify({ version: 1, entries: [entry, entry] })),
  );
  assert.throws(() => parseInventory('{"version":2,"entries":[]}'));
});

test("unreadable furniture storage is retained for recovery", () => {
  const storage = memoryStorage();
  storage.setItem(INVENTORY_KEY, "broken");
  const loaded = loadInventory(storage);
  assert.deepEqual(loaded.entries, []);
  assert.ok(loaded.error);
  assert.equal(storage.getItem(INVENTORY_KEY), "broken");
  assert.equal(storage.getItem(INVENTORY_RECOVERY_KEY), "broken");
  const refusesRecovery = {
    ...storage,
    setItem(key: string, value: string) {
      if (key === INVENTORY_RECOVERY_KEY) throw new Error("Recovery blocked");
      storage.setItem(key, value);
    },
  } as Storage;
  assert.throws(
    () => writeInventory(refusesRecovery, [entry], "broken"),
    /could not be preserved/,
  );
  assert.equal(storage.getItem(INVENTORY_KEY), "broken");
  writeInventory(storage, [entry], "broken");
  assert.deepEqual(loadInventory(storage).entries, [entry]);
  assert.equal(storage.getItem(INVENTORY_RECOVERY_KEY), "broken");
});

test("inventory persistence refuses stale tabs and reports quota failures", () => {
  const storage = memoryStorage();
  const first = writeInventory(storage, [entry], null);
  assert.deepEqual(loadInventory(storage).entries, [entry]);
  assert.throws(() => writeInventory(storage, [], null), /another tab/);
  assert.equal(storage.getItem(INVENTORY_KEY), first);
  const blocked = {
    ...storage,
    setItem() {
      throw new Error("Quota full");
    },
  } as Storage;
  assert.throws(() => writeInventory(blocked, [], first), /Quota/);
});

test("inventory placements convert units and retain independent snapshot dimensions", () => {
  const item = itemFromInventory(entry, "ft");
  const metric = convertItem(item, "ft", "m");
  assert.ok(
    metric.footprint.kind === "rect" && Math.abs(metric.footprint.w - 2) < 1e-9,
  );
  assert.equal(item.inventoryId, entry.id);
  const changed = structuredClone(entry);
  changed.name = "Updated inventory";
  if (changed.footprint.kind === "rect") changed.footprint.w = 1;
  assert.equal(item.name, "My sofa");
  assert.ok(item.footprint.kind === "rect" && item.footprint.w > 6);
  const room = createRoom("Living room");
  room.items.push(item);
  const loaded = safeParseDoc(
    JSON.stringify({ version: 4, rooms: [room], activeRoomId: room.id }),
  );
  assert.equal(loaded.rooms[0].items[0].inventoryId, entry.id);
});
