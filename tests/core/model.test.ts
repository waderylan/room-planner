import assert from "node:assert/strict";
import { test } from "node:test";
import { createDoc, createRoom, itemFromPreset } from "../../src/model/factory";
import { FURNITURE_PRESETS } from "../../src/model/presets";
import { migrateDoc, safeParseDoc } from "../../src/model/migrate";
import { convertRoom } from "../../src/model/units";
import { buildOutline } from "../../src/geometry/roomOutline";
import { polygonArea } from "../../src/geometry/polygon";
import { canShareFloorSpace, itemsCollide } from "../../src/model/collision";
import { findFreeSpot } from "../../src/model/freeSpot";

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test("unit conversion preserves every physical measurement and round trips", () => {
  const room = createRoom("Bedroom");
  room.shape = { kind: "lshape", width: 18, length: 16, notchCorner: "ne", notchWidth: 4, notchDepth: 3 };
  room.alcoves = [{ id: "alcove", wall: "w", offset: 4, width: 3, depth: 2 }];
  room.outline = buildOutline(room.shape, room.alcoves);
  room.openings = [{ id: "door", kind: "door", wallIndex: 0, width: 3, offset: 1, height: 6.5, sillHeight: 0, hinge: "left" }];
  room.items = [itemFromPreset(FURNITURE_PRESETS[0], room)];
  room.items[0].elevation = 1;
  const metric = convertRoom(room, "m");
  near(metric.shape.width, 18 * 0.3048);
  near(metric.shape.notchWidth!, 4 * 0.3048);
  near(metric.alcoves[0].offset, 4 * 0.3048);
  near(metric.openings[0].height, 6.5 * 0.3048);
  near(metric.items[0].height, room.items[0].height * 0.3048);
  near(metric.items[0].elevation, 0.3048);
  near(polygonArea(metric.outline), polygonArea(room.outline) * 0.3048 ** 2);
  const restored = convertRoom(metric, "ft");
  near(restored.shape.width, room.shape.width);
  near(restored.items[0].pos.x, room.items[0].pos.x);
  near(restored.items[0].height, room.items[0].height);
  near(restored.openings[0].width, room.openings[0].width);
  near(restored.alcoves[0].depth, room.alcoves[0].depth);
});

test("presets have identical real-world dimensions in feet and meters", () => {
  const imperial = createRoom("Room");
  const metric = convertRoom(imperial, "m");
  const a = itemFromPreset(FURNITURE_PRESETS[0], imperial);
  const b = itemFromPreset(FURNITURE_PRESETS[0], metric);
  assert.equal(a.footprint.kind, "rect");
  assert.equal(b.footprint.kind, "rect");
  if (a.footprint.kind === "rect" && b.footprint.kind === "rect") {
    near(b.footprint.w, a.footprint.w * 0.3048);
    near(b.footprint.d, a.footprint.d * 0.3048);
  }
  near(b.height, a.height * 0.3048);
});

test("file validation rejects malformed nested furniture and unsupported versions", () => {
  const doc = createDoc();
  const cases: unknown[] = [null, { rooms: [null] }, { ...doc, version: 99 }, { ...doc, rooms: [{ ...doc.rooms[0], shape: { kind: "rect", width: -2, length: 10 } }] }];
  const badItem = { ...itemFromPreset(FURNITURE_PRESETS[0], doc.rooms[0]), pos: { x: Infinity, y: 2 } };
  cases.push({ ...doc, rooms: [{ ...doc.rooms[0], items: [badItem] }] });
  cases.push({ ...doc, rooms: [{ ...doc.rooms[0], items: [{ ...badItem, pos: { x: 0, y: 0 }, footprint: { kind: "poly", points: [] } }] }] });
  for (const input of cases) assert.throws(() => migrateDoc(input));
  assert.throws(() => safeParseDoc("{"), /valid JSON/);
  assert.throws(() => safeParseDoc(" ".repeat(5 * 1024 * 1024 + 1)), /5 MB/);
});

test("file validation derives outlines and normalizes unsafe presentation values", () => {
  const doc = createDoc();
  const room = doc.rooms[0];
  room.items = [{ ...itemFromPreset(FURNITURE_PRESETS[0], room), color: "url(https://example.com/track)", rotDeg: -90 }];
  room.outline = [{ x: NaN, y: NaN }];
  const restored = migrateDoc(doc);
  assert.deepEqual(restored.rooms[0].outline, buildOutline(room.shape, []));
  assert.equal(restored.rooms[0].items[0].color, "#8a8f98");
  assert.equal(restored.rooms[0].items[0].rotDeg, 270);
  assert.equal(restored.rooms[0].selectedItemId, null);
});

test("duplicate entity ids are rejected before entering the store", () => {
  const doc = createDoc();
  const item = itemFromPreset(FURNITURE_PRESETS[0], doc.rooms[0]);
  doc.rooms[0].items = [item, { ...item }];
  assert.throws(() => migrateDoc(doc), /Duplicate furniture/);
  assert.throws(() => migrateDoc({ ...createDoc(), rooms: [doc.rooms[0], doc.rooms[0]] }));
});

test("touching edges, rugs, hidden and vertically disjoint furniture are allowed", () => {
  const room = createRoom("Room");
  const a = { ...itemFromPreset(FURNITURE_PRESETS[0], room), pos: { x: 0, y: 0 } };
  const b = { ...a, id: "other", pos: { x: 6, y: 0 } };
  assert.equal(itemsCollide(a, b, "ft"), false);
  assert.equal(itemsCollide(a, { ...b, pos: { x: 5, y: 0 } }, "ft"), true);
  assert.equal(canShareFloorSpace(a, { ...b, elevation: a.height }, "ft"), true);
  assert.equal(canShareFloorSpace(a, { ...b, height: 0.05 }, "ft"), true);
  assert.equal(canShareFloorSpace(a, { ...b, hidden: true }, "ft"), true);
});

test("placement ignores floor coverings and hidden items in either unit", () => {
  for (const unit of ["ft", "m"] as const) {
    const room = convertRoom(createRoom("Room"), unit);
    const sofa = itemFromPreset(FURNITURE_PRESETS[0], room);
    const rugPreset = FURNITURE_PRESETS.find((p) => p.id === "rug")!;
    room.items = [{ ...itemFromPreset(rugPreset, room), pos: { x: 0, y: 0 } }];
    assert.deepEqual(findFreeSpot(room, sofa), { x: 0, y: 0 });
  }
});
