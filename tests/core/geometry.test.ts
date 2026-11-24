import test from "node:test";
import assert from "node:assert/strict";
import type { Item } from "../../src/model/types.ts";
import { canShareFloorSpace, isFloorCovering, itemsCollide } from "../../src/model/collision.ts";
import { convertItem } from "../../src/model/units.ts";
import { repositionForResize, worldPolygon } from "../../src/geometry/shape.ts";
import { centroid } from "../../src/geometry/polygon.ts";
import { lShapePolygon } from "../../src/geometry/lshape.ts";
import { fitViewBox, zoomViewBox } from "../../src/components/Canvas2D/viewBox.ts";
import { furnitureParts } from "../../src/components/View3D/furnitureParts.ts";
import { CUSTOM_PRESET, FURNITURE_PRESETS, presetIdOf } from "../../src/model/presets.ts";
import { createRoom, itemFromPreset } from "../../src/model/factory.ts";
import { migrateItem } from "../../src/model/migrate.ts";
import { footprintSize } from "../../src/geometry/shape.ts";

const item = (patch: Partial<Item> = {}): Item => ({ id: "item", name: "Desk", footprint: { kind: "rect", w: 4, d: 2 }, pos: { x: 0, y: 0 }, rotDeg: 0, height: 2.5, elevation: 0, color: "#788899", hidden: false, ...patch });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test("touching furniture edges are allowed, overlapping interiors are not", () => {
  const desk = item();
  assert.equal(itemsCollide(desk, item({ pos: { x: 4, y: 0 } }), "ft"), false);
  assert.equal(itemsCollide(desk, item({ pos: { x: 3.9, y: 0 } }), "ft"), true);
  assert.equal(itemsCollide(desk, item({ pos: { x: 0, y: 2 } }), "ft"), false);
});

test("rugs and vertically separated furniture can share a footprint", () => {
  const rug = item({ height: .05 });
  assert.equal(isFloorCovering(rug, "ft"), true);
  assert.equal(itemsCollide(rug, item(), "ft"), false);
  assert.equal(canShareFloorSpace(item(), item({ elevation: 2.5 }), "ft"), true);
  assert.equal(itemsCollide(item(), item({ elevation: 2.4 }), "ft"), true);
});

test("metric conversion preserves rug and collision classification", () => {
  const rug = item({ height: .05 });
  const desk = item();
  assert.equal(isFloorCovering(convertItem(rug, "ft", "m"), "m"), true);
  assert.equal(isFloorCovering(convertItem(desk, "ft", "m"), "m"), false);
  assert.equal(itemsCollide(convertItem(rug, "ft", "m"), convertItem(desk, "ft", "m"), "m"), false);
});

test("hidden furniture does not block placement", () => {
  assert.equal(itemsCollide(item(), item({ hidden: true }), "ft"), false);
});

test("a piece inside an L-shape notch remains collision free after rotation", () => {
  const outline = lShapePolygon(8, 8, "se", 4, 4);
  const corner = item({ footprint: { kind: "poly", points: outline } });
  const small = item({ footprint: { kind: "rect", w: 1, d: 1 }, pos: { x: 5, y: 5 }, rotDeg: 30 });
  assert.equal(itemsCollide(corner, small, "ft"), false);
  assert.equal(itemsCollide(corner, { ...small, pos: { x: 1, y: 1 } }, "ft"), true);
});

test("resizing a rotated rectangle preserves its opposite edge", () => {
  for (const rotation of [0, 30, 90, 135, 270]) {
    const original = item({ pos: { x: 3, y: 7 }, rotDeg: rotation });
    const newPos = repositionForResize(original.pos, rotation, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 1 });
    const before = worldPolygon(original);
    const after = worldPolygon({ ...original, pos: newPos, footprint: { kind: "rect", w: 6, d: 2 } });
    near(before[0].x, after[0].x); near(before[0].y, after[0].y);
    near(before[3].x, after[3].x); near(before[3].y, after[3].y);
  }
});

test("resizing a rotated concave footprint preserves its chosen anchor", () => {
  const oldPoints = lShapePolygon(8, 6, "ne", 3, 2);
  const newPoints = lShapePolygon(10, 6, "ne", 3, 2);
  const oldCenter = centroid(oldPoints), newCenter = centroid(newPoints);
  const original = item({ footprint: { kind: "poly", points: oldPoints }, pos: { x: 3, y: 4 }, rotDeg: 47 });
  const newPos = repositionForResize(original.pos, original.rotDeg, oldCenter, newCenter, oldPoints[0], newPoints[0]);
  const before = worldPolygon(original)[0];
  const after = worldPolygon({ ...original, pos: newPos, footprint: { kind: "poly", points: newPoints } })[0];
  near(before.x, after.x); near(before.y, after.y);
});

test("zoom preserves the pointer's relative location and enforces zoom bounds", () => {
  const vb = fitViewBox([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }, { x: 0, y: 10 }]);
  const pointer = { x: 4, y: 3 };
  const zoomed = zoomViewBox(vb, .6, pointer);
  near((pointer.x - vb.x) / vb.w, (pointer.x - zoomed.x) / zoomed.w);
  near((pointer.y - vb.y) / vb.h, (pointer.y - zoomed.y) / zoomed.h);
  assert.equal(zoomViewBox(vb, .000001, pointer).w, 2);
  assert.equal(zoomViewBox(vb, 10000, pointer).w, 200);
});

test("fit-to-room preserves visual scale when converting feet to meters", () => {
  const outline = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }, { x: 0, y: 10 }];
  const feet = fitViewBox(outline);
  const meters = fitViewBox(outline.map((point) => ({ x: point.x * .3048, y: point.y * .3048 })));
  near(meters.w / feet.w, .3048); near(meters.h / feet.h, .3048);
  near(meters.x / feet.x, .3048); near(meters.y / feet.y, .3048);
});

test("every catalog visual stays inside its measured width, depth, and height", () => {
  for (const preset of FURNITURE_PRESETS) for (const scale of [1, .3048]) {
    const { w, d } = footprintSize(preset.footprint);
    const dimensions = [w * scale, preset.height * scale, d * scale];
    const parts = furnitureParts(preset.id, dimensions[0], dimensions[2], dimensions[1]);
    assert.ok(parts.length > 0, `${preset.id} has no visual parts`);
    for (const part of parts) for (let axis = 0; axis < 3; axis++) {
      assert.ok(part.size[axis] > 0, `${preset.id} has an empty part`);
      const min = axis === 1 ? 0 : -dimensions[axis] / 2;
      const max = axis === 1 ? dimensions[axis] : dimensions[axis] / 2;
      assert.ok(part.center[axis] - part.size[axis] / 2 >= min - 1e-8, `${preset.id} extends below its measured bounds on axis ${axis}`);
      assert.ok(part.center[axis] + part.size[axis] / 2 <= max + 1e-8, `${preset.id} extends above its measured bounds on axis ${axis}`);
    }
  }
});

test("furniture retains its visual identity after rename, conversion, and file loading", () => {
  const sofa = itemFromPreset(FURNITURE_PRESETS[0], createRoom("Room"));
  sofa.name = "Blue couch";
  assert.equal(presetIdOf(sofa), "sofa");
  assert.equal(presetIdOf(convertItem(sofa, "ft", "m")), "sofa");
  assert.equal(migrateItem(JSON.parse(JSON.stringify(sofa))).presetId, "sofa");
  assert.equal(presetIdOf({ name: "Bed (Queen) copy" }), "bed-queen");
  assert.equal(presetIdOf({ ...itemFromPreset(CUSTOM_PRESET, createRoom("Room")), name: "Sofa" }), "custom");
  assert.equal(migrateItem({ ...sofa, name: "Custom name", presetId: "untrusted-script" }).presetId, undefined);
});
