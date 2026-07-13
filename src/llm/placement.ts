import type { Footprint, Item, Room } from "../model/types";
import type { Vec2 } from "../geometry/types";
import { worldPolygon, isFullyInside, worldCenter } from "../geometry/shape";
import { polygonsIntersect, centroid, polygonArea, snap } from "../geometry/polygon";

/**
 * Placement engine for the LLM tool layer.
 *
 * The goal is to let the model express *intent* ("against the north wall",
 * "to the right of the bed", "in the middle") and have deterministic geometry
 * turn that into a concrete, non-overlapping, in-bounds position + rotation.
 * The model is bad at the trig required by the raw coordinate system (pos is
 * the top-left of the footprint *before* rotation, and rotation is about the
 * footprint centroid); this module does that math so the model doesn't have to.
 */

const STEP = 0.25;
// Shrink polygons by this fraction about their centroid before testing overlap,
// so pieces that merely *touch* (flush neighbours, item flush to a wall) are not
// reported as overlapping — only real interpenetration counts.
const SHRINK = 0.02;
// Items at or below this height (rugs, mats) are floor coverings meant to sit
// UNDER furniture, so they never block placement and never count as overlaps.
const FLAT_HEIGHT = 0.15;

export function isFlat(item: Pick<Item, "height">): boolean {
  return item.height <= FLAT_HEIGHT;
}

export type WallSide = "n" | "e" | "s" | "w";
export type Corner = "nw" | "ne" | "sw" | "se";
export type Align = "start" | "center" | "end";

export type PlacementSpec =
  | { kind: "wall"; wall: WallSide; align: Align; gap: number; rotDeg?: number }
  | { kind: "corner"; corner: Corner; gap: number; rotDeg?: number }
  | { kind: "center"; rotDeg?: number }
  | { kind: "beside"; refId: string; side: WallSide; align: Align; gap: number; rotDeg?: number };

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PlacementResult {
  /** Final item.pos (top-left of the unrotated footprint), snapped to the grid. */
  pos: Vec2;
  rotDeg: number;
  /** True if the exact requested spot was taken and we had to nudge to a free one. */
  adjusted: boolean;
  /** False if no non-overlapping spot could be found and we placed anyway (overlaps). */
  placed: boolean;
}

function polyBounds(poly: Vec2[]): Bounds {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function roomBounds(room: Room): Bounds {
  return polyBounds(room.outline);
}

/** World-space bounds of a footprint rotated by rotDeg and placed at pos {0,0}. */
function rotatedOffset(footprint: Footprint, rotDeg: number): Bounds {
  return polyBounds(worldPolygon({ footprint, pos: { x: 0, y: 0 }, rotDeg }));
}

function sizeAt(footprint: Footprint, rotDeg: number): { w: number; h: number; off: Bounds } {
  const off = rotatedOffset(footprint, rotDeg);
  return { w: off.maxX - off.minX, h: off.maxY - off.minY, off };
}

/** pos such that the rotated footprint's world bounding box starts at (worldMinX, worldMinY). */
function posForWorldMin(off: Bounds, worldMinX: number, worldMinY: number): Vec2 {
  return { x: worldMinX - off.minX, y: worldMinY - off.minY };
}

function shrinkPoly(poly: Vec2[], k = SHRINK): Vec2[] {
  const c = centroid(poly);
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * (1 - k), y: c.y + (p.y - c.y) * (1 - k) }));
}

/** True only if the interiors of two footprints actually overlap (touching is allowed). */
export function interiorsOverlap(a: Vec2[], b: Vec2[]): boolean {
  return polygonsIntersect(shrinkPoly(a), shrinkPoly(b));
}

function isValid(
  room: Room,
  footprint: Footprint,
  rotDeg: number,
  pos: Vec2,
  excludeId?: string,
  flat = false,
): boolean {
  const poly = worldPolygon({ footprint, pos, rotDeg });
  if (!isFullyInside(poly, room.outline)) return false;
  if (flat) return true; // floor coverings only need to be in bounds
  for (const it of room.items) {
    if (it.id === excludeId || it.hidden || isFlat(it)) continue;
    if (interiorsOverlap(poly, worldPolygon(it))) return false;
  }
  return true;
}

/** Slide along one axis from the desired spot to the nearest valid offset. */
function slideResolve(
  room: Room,
  footprint: Footprint,
  rotDeg: number,
  desired: Vec2,
  axis: "x" | "y",
  excludeId: string | undefined,
  flat: boolean,
): Vec2 | null {
  const b = roomBounds(room);
  const span = axis === "x" ? b.maxX - b.minX : b.maxY - b.minY;
  const steps = Math.ceil(span / STEP) + 2;
  for (let k = 0; k <= steps; k++) {
    for (const dir of k === 0 ? [0] : [1, -1]) {
      const off = dir * k * STEP;
      const pos = axis === "x" ? { x: desired.x + off, y: desired.y } : { x: desired.x, y: desired.y + off };
      if (isValid(room, footprint, rotDeg, pos, excludeId, flat)) return pos;
    }
  }
  return null;
}

/** Search the whole room grid for the valid spot closest to the desired one. */
function nearestResolve(
  room: Room,
  footprint: Footprint,
  rotDeg: number,
  desired: Vec2,
  excludeId: string | undefined,
  flat: boolean,
): Vec2 | null {
  const b = roomBounds(room);
  const cands: { pos: Vec2; d: number }[] = [];
  for (let y = b.minY; y <= b.maxY; y += STEP) {
    for (let x = b.minX; x <= b.maxX; x += STEP) {
      cands.push({ pos: { x, y }, d: (x - desired.x) ** 2 + (y - desired.y) ** 2 });
    }
  }
  cands.sort((p, q) => p.d - q.d);
  for (const c of cands) {
    if (isValid(room, footprint, rotDeg, c.pos, excludeId, flat)) return c.pos;
  }
  return null;
}

function resolve(
  room: Room,
  footprint: Footprint,
  rotDeg: number,
  desired: Vec2,
  slideAxis: "x" | "y" | null,
  excludeId: string | undefined,
  flat: boolean,
): PlacementResult {
  const d = { x: snap(desired.x, STEP), y: snap(desired.y, STEP) };
  if (isValid(room, footprint, rotDeg, d, excludeId, flat)) return { pos: d, rotDeg, adjusted: false, placed: true };
  if (slideAxis) {
    const s = slideResolve(room, footprint, rotDeg, d, slideAxis, excludeId, flat);
    if (s) return { pos: s, rotDeg, adjusted: true, placed: true };
  }
  const n = nearestResolve(room, footprint, rotDeg, d, excludeId, flat);
  if (n) return { pos: n, rotDeg, adjusted: true, placed: true };
  return { pos: d, rotDeg, adjusted: true, placed: false };
}

/** Rotation that makes an item's "front" (its +depth edge) face into the room from a wall. */
function defaultWallRot(wall: WallSide): number {
  switch (wall) {
    case "n":
      return 0;
    case "s":
      return 180;
    case "w":
      return 270;
    case "e":
      return 90;
  }
}

function alongCoord(align: Align, lo: number, hi: number, size: number, gap: number): number {
  switch (align) {
    case "start":
      return lo + gap;
    case "end":
      return hi - gap - size;
    case "center":
      return (lo + hi) / 2 - size / 2;
  }
}

/**
 * Turn a placement intent into a concrete, resolved (non-overlapping, in-bounds)
 * position + rotation for the given footprint in the given room.
 */
export function computePlacement(
  room: Room,
  footprint: Footprint,
  spec: PlacementSpec,
  excludeId?: string,
  flat = false,
): PlacementResult {
  const b = roomBounds(room);

  if (spec.kind === "center") {
    const rot = spec.rotDeg ?? 0;
    const { w, h, off } = sizeAt(footprint, rot);
    const desired = posForWorldMin(off, (b.minX + b.maxX) / 2 - w / 2, (b.minY + b.maxY) / 2 - h / 2);
    return resolve(room, footprint, rot, desired, null, excludeId, flat);
  }

  if (spec.kind === "corner") {
    const rot = spec.rotDeg ?? 0;
    const { w, h, off } = sizeAt(footprint, rot);
    const gap = spec.gap;
    const left = spec.corner === "nw" || spec.corner === "sw";
    const top = spec.corner === "nw" || spec.corner === "ne";
    const worldMinX = left ? b.minX + gap : b.maxX - gap - w;
    const worldMinY = top ? b.minY + gap : b.maxY - gap - h;
    return resolve(room, footprint, rot, posForWorldMin(off, worldMinX, worldMinY), null, excludeId, flat);
  }

  if (spec.kind === "wall") {
    const rot = spec.rotDeg ?? defaultWallRot(spec.wall);
    const { w, h, off } = sizeAt(footprint, rot);
    const gap = spec.gap;
    let desired: Vec2;
    let slideAxis: "x" | "y";
    if (spec.wall === "n" || spec.wall === "s") {
      const worldMinY = spec.wall === "n" ? b.minY + gap : b.maxY - gap - h;
      const worldMinX = alongCoord(spec.align, b.minX, b.maxX, w, gap);
      desired = posForWorldMin(off, worldMinX, worldMinY);
      slideAxis = "x";
    } else {
      const worldMinX = spec.wall === "w" ? b.minX + gap : b.maxX - gap - w;
      const worldMinY = alongCoord(spec.align, b.minY, b.maxY, h, gap);
      desired = posForWorldMin(off, worldMinX, worldMinY);
      slideAxis = "y";
    }
    return resolve(room, footprint, rot, desired, slideAxis, excludeId, flat);
  }

  // beside another item
  const ref = room.items.find((it) => it.id === spec.refId);
  if (!ref) {
    // No such reference: fall back to centering so we still do something sane.
    return computePlacement(room, footprint, { kind: "center", rotDeg: spec.rotDeg }, excludeId, flat);
  }
  const rot = spec.rotDeg ?? 0;
  const { w, h, off } = sizeAt(footprint, rot);
  const rB = polyBounds(worldPolygon(ref));
  const gap = spec.gap;
  let desired: Vec2;
  let slideAxis: "x" | "y";
  if (spec.side === "e" || spec.side === "w") {
    const worldMinX = spec.side === "e" ? rB.maxX + gap : rB.minX - gap - w;
    const worldMinY = alongCoord(spec.align, rB.minY, rB.maxY, h, 0);
    desired = posForWorldMin(off, worldMinX, worldMinY);
    slideAxis = "y";
  } else {
    const worldMinY = spec.side === "s" ? rB.maxY + gap : rB.minY - gap - h;
    const worldMinX = alongCoord(spec.align, rB.minX, rB.maxX, w, 0);
    desired = posForWorldMin(off, worldMinX, worldMinY);
    slideAxis = "x";
  }
  return resolve(room, footprint, rot, desired, slideAxis, excludeId, flat);
}

export interface OverlapPair {
  a: { id: string; name: string };
  b: { id: string; name: string };
}

export interface RoomIssues {
  overlaps: OverlapPair[];
  outOfBounds: { id: string; name: string }[];
  roomArea: number;
  usedArea: number;
  freeArea: number;
}

/** Report every overlapping pair and out-of-bounds item, plus area accounting. */
export function roomIssues(room: Room): RoomIssues {
  const polys = room.items
    .filter((it) => !it.hidden)
    .map((it) => ({ it, poly: worldPolygon(it) }));
  const outOfBounds: RoomIssues["outOfBounds"] = [];
  for (const { it, poly } of polys) {
    if (!isFullyInside(poly, room.outline)) outOfBounds.push({ id: it.id, name: it.name });
  }
  const overlaps: OverlapPair[] = [];
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      // Flat floor coverings (rugs) are meant to sit under furniture.
      if (isFlat(polys[i].it) || isFlat(polys[j].it)) continue;
      if (interiorsOverlap(polys[i].poly, polys[j].poly)) {
        overlaps.push({
          a: { id: polys[i].it.id, name: polys[i].it.name },
          b: { id: polys[j].it.id, name: polys[j].it.name },
        });
      }
    }
  }
  const roomArea = polygonArea(room.outline);
  const usedArea = polys.reduce((sum, { poly }) => sum + polygonArea(poly), 0);
  return {
    overlaps,
    outOfBounds,
    roomArea: Number(roomArea.toFixed(2)),
    usedArea: Number(usedArea.toFixed(2)),
    freeArea: Number((roomArea - usedArea).toFixed(2)),
  };
}

/** World-space center of an item (useful to report where something ended up). */
export function itemCenter(item: Pick<Item, "footprint" | "pos" | "rotDeg">): Vec2 {
  const c = worldCenter(item);
  return { x: Number(c.x.toFixed(2)), y: Number(c.y.toFixed(2)) };
}
