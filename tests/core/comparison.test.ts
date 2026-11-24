import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoom } from "../../src/model/factory";
import { convertRoom } from "../../src/model/units";
import { buildOutline } from "../../src/geometry/roomOutline";
import {
  compareInventory,
  compareInventoryTrial,
  createInventoryTrial,
  findInventoryPlacement,
  itemFromInventory,
  validInventoryPlacement,
} from "../../src/inventory/comparison";
import type { InventoryEntry } from "../../src/inventory/types";
import type { Doc, Room } from "../../src/model/types";

const entry: InventoryEntry = {
  id: "sofa",
  name: "Owned sofa",
  footprint: { kind: "rect", w: 2, d: 0.8 },
  height: 0.8,
  elevation: 0,
  color: "#8a8f98",
  quantity: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};
function room(width = 4, length = 3): Room {
  const value = createRoom("Living room");
  value.unit = "m";
  value.ceiling = 2.4;
  value.shape = { kind: "rect", width, length };
  value.outline = buildOutline(value.shape, []);
  return value;
}
const document = (...rooms: Room[]): Doc => ({
  version: 4,
  rooms,
  activeRoomId: rooms[0].id,
});

test("comparison only counts owned pieces placed at their saved physical dimensions", () => {
  const target = room();
  const placed = findInventoryPlacement(entry, target)!;
  target.items.push(placed);
  assert.equal(
    compareInventory(document(target), [entry]).results[0].status,
    "placed",
  );
  assert.equal(
    compareInventory(document(convertRoom(target, "ft")), [entry]).placed,
    1,
  );
  target.items[0].footprint = { kind: "rect", w: 0.5, d: 0.5 };
  const mismatch = compareInventory(document(target), [entry]);
  assert.equal(mismatch.placed, 0);
  assert.equal(mismatch.results[0].status, "different-dimensions");
});

test("comparison distinguishes provable size limits from pieces needing placement", () => {
  assert.equal(
    compareInventory(document(room(1, 1)), [entry]).results[0].status,
    "too-large",
  );
  assert.equal(
    compareInventory(document(room()), [{ ...entry, height: 3 }]).results[0]
      .status,
    "too-tall",
  );
  assert.equal(
    compareInventory(document(room()), [entry]).results[0].status,
    "not-placed",
  );
});

test("trial arrangements preserve source documents, fixtures and inventory quantities", () => {
  const target = room();
  const fixture = itemFromInventory(
    { ...entry, id: "fixture", footprint: { kind: "rect", w: 0.4, d: 0.4 } },
    "m",
  );
  fixture.pos = { x: 3.6, y: 2.6 };
  delete fixture.inventoryId;
  target.items.push(fixture);
  const source = document(target);
  const before = JSON.stringify(source);
  const trial = createInventoryTrial(source, [{ ...entry, quantity: 2 }]);
  assert.equal(trial.added, 2);
  assert.equal(JSON.stringify(source), before);
  assert.ok(trial.doc.rooms[0].items.some((item) => item.id === fixture.id));
  assert.equal(
    compareInventory(trial.doc, [{ ...entry, quantity: 2 }]).placed,
    2,
  );
  assert.equal(
    createInventoryTrial(trial.doc, [{ ...entry, quantity: 2 }]).added,
    0,
  );
});

test("a failed bounded trial remains unplaced and never claims furniture must be replaced", () => {
  const target = room();
  target.items.push({
    ...itemFromInventory(
      { ...entry, id: "fixture", footprint: { kind: "rect", w: 4, d: 3 } },
      "m",
    ),
    inventoryId: undefined,
  });
  const source = document(target);
  const trial = createInventoryTrial(source, [entry]);
  assert.equal(trial.added, 0);
  assert.equal(
    compareInventoryTrial(trial, [entry]).results[0].status,
    "needs-layout",
  );
  assert.equal(
    compareInventory(source, [entry]).results[0].status,
    "not-placed",
  );
  assert.equal(source.rooms[0].items.length, 1);
});

test("trial placement shares a deterministic budget across the whole inventory", () => {
  const source = document(room(30, 30));
  const entries = Array.from({ length: 20 }, (_, index) => ({
    ...entry,
    id: `piece-${index}`,
    quantity: 50,
  }));
  const trial = createInventoryTrial(source, entries, undefined, {
    maxChecks: 5,
  });
  assert.ok(trial.checked <= 5);
  assert.equal(trial.exhausted, true);
  assert.ok(trial.unplacedIds.length > 0);
  assert.equal(source.rooms[0].items.length, 0);
  assert.ok(
    compareInventoryTrial(trial, entries).results.some(
      (fit) =>
        fit.status === "needs-layout" &&
        fit.reason.includes("search reached its limit"),
    ),
  );
});

test("room assignments prevent trial furniture being silently packed into unrelated rooms", () => {
  const living = room(1, 1),
    bedroom = room(5, 5);
  bedroom.name = "Bedroom";
  const source = document(living, bedroom);
  const result = createInventoryTrial(source, [entry], { sofa: living.id });
  assert.equal(result.added, 0);
  assert.equal(result.doc.rooms[1].items.length, 0);
  const alternate = createInventoryTrial(source, [entry], { sofa: bedroom.id });
  assert.equal(alternate.added, 1);
  assert.equal(alternate.doc.rooms[0].items.length, 0);
});

test("comparison reports duplicate instances beyond the owned quantity", () => {
  const first = room(),
    second = room();
  first.items.push(findInventoryPlacement(entry, first)!);
  second.items.push(findInventoryPlacement(entry, second)!);
  assert.equal(
    compareInventory(document(first, second), [entry]).results[0].status,
    "needs-layout",
  );
  assert.match(
    compareInventory(document(first, second), [entry]).results[0].reason,
    /2 copies/,
  );
});

test("door swings are checked while searching and evaluating placed furniture", () => {
  const target = room();
  target.openings = [
    {
      id: "door",
      kind: "door",
      wallIndex: 0,
      offset: 0,
      width: 1,
      height: 2,
      sillHeight: 0,
      hinge: "left",
    },
  ];
  const blocking = itemFromInventory(
    { ...entry, footprint: { kind: "rect", w: 0.5, d: 0.5 } },
    "m",
  );
  blocking.pos = { x: 0.1, y: 0.1 };
  assert.equal(validInventoryPlacement(blocking, target), false);
  const placed = findInventoryPlacement(entry, target);
  assert.ok(placed);
  assert.equal(validInventoryPlacement(placed, target), true);
});
