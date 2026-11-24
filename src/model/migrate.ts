import { v4 as uuid } from "uuid";
import type { Alcove, Doc, Footprint, Item, Opening, Room, RoomShape } from "./types";
import type { Vec2 } from "../geometry/types";
import { buildOutline } from "../geometry/roomOutline";
import { clampOpening } from "../geometry/openings";
import { polygonArea } from "../geometry/polygon";
import { createDoc } from "./factory";
import { presetIdOf } from "./presets";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1000;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}

function number(value: unknown, label: string, min = -MAX_DIMENSION, max = MAX_DIMENSION): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}.`);
  return value;
}

function optionalNumber(value: unknown, fallback: number, label: string, min = 0, max = MAX_DIMENSION): number {
  return value === undefined ? fallback : number(value, label, min, max);
}

function text(value: unknown, label: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new Error(`Invalid ${label}.`);
  return value.trim();
}

function point(value: unknown): Vec2 {
  const p = record(value, "coordinate");
  return { x: number(p.x, "x coordinate", -MAX_DIMENSION * 4, MAX_DIMENSION * 4), y: number(p.y, "y coordinate", -MAX_DIMENSION * 4, MAX_DIMENSION * 4) };
}

function footprint(value: unknown): Footprint {
  const f = record(value, "furniture shape");
  if (f.kind === "rect") return { kind: "rect", w: number(f.w, "furniture width", 0.001), d: number(f.d, "furniture depth", 0.001) };
  if (f.kind === "circle") return { kind: "circle", r: number(f.r, "furniture radius", 0.001) };
  if (f.kind === "poly" && Array.isArray(f.points) && f.points.length >= 3 && f.points.length <= 64) {
    const points = f.points.map(point);
    if (polygonArea(points) < 0.000001) throw new Error("Furniture shape has no area.");
    return { kind: "poly", points };
  }
  throw new Error("Invalid furniture shape.");
}

export function migrateItem(value: unknown): Item {
  const item = record(value, "furniture");
  const color = typeof item.color === "string" && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(item.color) ? item.color : "#8a8f98";
  const name = text(item.name, "furniture name", "Furniture");
  const presetId = presetIdOf({ name, presetId: typeof item.presetId === "string" ? item.presetId : undefined });
  return {
    id: text(item.id, "furniture identifier", uuid()),
    name,
    ...(presetId ? { presetId } : {}),
    ...(typeof item.inventoryId === "string" && item.inventoryId.length > 0 && item.inventoryId.length <= 200 ? { inventoryId: item.inventoryId } : {}),
    footprint: footprint(item.footprint),
    pos: point(item.pos),
    rotDeg: ((optionalNumber(item.rotDeg, 0, "rotation", -360000, 360000) % 360) + 360) % 360,
    height: optionalNumber(item.height, 2.5, "furniture height", 0),
    elevation: optionalNumber(item.elevation, 0, "furniture elevation", 0),
    color,
    hidden: item.hidden === true,
  };
}

export function migrateShape(value: unknown): RoomShape {
  if (value === undefined) return { kind: "rect", width: 12, length: 10 };
  const shape = record(value, "room shape");
  if (shape.kind !== "rect" && shape.kind !== "lshape") throw new Error("Invalid room shape.");
  const width = number(shape.width, "room width", 0.1);
  const length = number(shape.length, "room length", 0.1);
  if (shape.kind === "rect") return { kind: "rect", width, length };
  const notchCorner = shape.notchCorner ?? "ne";
  if (notchCorner !== "nw" && notchCorner !== "ne" && notchCorner !== "sw" && notchCorner !== "se") throw new Error("Invalid notch corner.");
  return {
    kind: "lshape", width, length, notchCorner,
    notchWidth: optionalNumber(shape.notchWidth, width / 2, "notch width", 0.001, width - 0.001),
    notchDepth: optionalNumber(shape.notchDepth, length / 2, "notch depth", 0.001, length - 0.001),
  };
}

export function migrateAlcove(value: unknown, shape: RoomShape): Alcove {
  const a = record(value, "alcove");
  if (a.wall !== "n" && a.wall !== "e" && a.wall !== "s" && a.wall !== "w") throw new Error("Invalid alcove wall.");
  const wallLength = a.wall === "n" || a.wall === "s" ? shape.width : shape.length;
  const width = Math.min(number(a.width, "alcove width", 0.001), wallLength);
  return {
    id: text(a.id, "alcove identifier", uuid()), wall: a.wall,
    offset: Math.min(optionalNumber(a.offset, 0, "alcove offset"), wallLength - width),
    width, depth: number(a.depth, "alcove depth", 0.001),
  };
}

export function migrateOpening(value: unknown, outline: Vec2[], ceiling: number): Opening {
  const o = record(value, "opening");
  if (o.kind !== "door" && o.kind !== "window") throw new Error("Invalid opening kind.");
  const wallIndex = optionalNumber(o.wallIndex, 0, "opening wall", 0);
  if (!Number.isInteger(wallIndex)) throw new Error("Invalid opening wall.");
  return clampOpening(outline, ceiling, {
    id: text(o.id, "opening identifier", uuid()), kind: o.kind, wallIndex,
    offset: optionalNumber(o.offset, 0, "opening offset"),
    width: optionalNumber(o.width, 3, "opening width", 0.001),
    height: optionalNumber(o.height, o.kind === "door" ? 6.67 : 3.5, "opening height", 0.001),
    sillHeight: optionalNumber(o.sillHeight, o.kind === "door" ? 0 : 3, "window sill height"),
    hinge: o.hinge === "right" ? "right" : "left",
  });
}

function list(value: unknown, label: string, max: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`Too many or invalid ${label}.`);
  return value;
}

function uniqueIds(values: { id: string }[], label: string): void {
  if (new Set(values.map((value) => value.id)).size !== values.length) throw new Error(`Duplicate ${label} identifiers.`);
}

function migrateRoom(value: unknown): Room {
  const r = record(value, "room");
  const shape = migrateShape(r.shape);
  const alcoves = list(r.alcoves, "alcoves", 24).map((a) => migrateAlcove(a, shape));
  // The outline is derived. Never trust arbitrary coordinates from an imported file.
  const outline = buildOutline(shape, alcoves);
  if (outline.length < 3 || polygonArea(outline) <= 0) throw new Error("Invalid room outline.");
  const ceiling = optionalNumber(r.ceiling, r.unit === "m" ? 2.4384 : 8, "ceiling height", 0.1);
  const openings = list(r.openings, "openings", 100).map((o) => migrateOpening(o, outline, ceiling));
  const items = list(r.items, "furniture items", 500).map(migrateItem);
  uniqueIds(items, "furniture");
  uniqueIds(alcoves, "alcove");
  uniqueIds(openings, "opening");
  return {
    id: text(r.id, "room identifier"), name: text(r.name, "room name"),
    unit: r.unit === "m" ? "m" : "ft", shape, alcoves, outline, ceiling, openings, items,
    selectedItemId: null,
    measureMode: r.measureMode === "furniture" ? "furniture" : "wall",
  };
}

/** Validates every nested field before any imported data reaches rendering or geometry. */
export function migrateDoc(raw: unknown): Doc {
  const obj = record(raw, "room planner document");
  if (obj.version !== undefined && (typeof obj.version !== "number" || obj.version < 1 || obj.version > 4 || !Number.isInteger(obj.version))) {
    throw new Error("This document version is not supported.");
  }
  if (!Array.isArray(obj.rooms) || !obj.rooms.length || obj.rooms.length > 50) throw new Error("A design must contain 1–50 rooms.");
  const rooms = obj.rooms.map(migrateRoom);
  uniqueIds(rooms, "room");
  const activeRoomId = typeof obj.activeRoomId === "string" && rooms.some((r) => r.id === obj.activeRoomId) ? obj.activeRoomId : rooms[0].id;
  return { version: 4, rooms, activeRoomId };
}

export function safeParseDoc(json: string): Doc {
  if (json.length > MAX_FILE_BYTES) throw new Error("Design files must be smaller than 5 MB.");
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { throw new Error("File is not valid JSON."); }
  return migrateDoc(parsed);
}

export function emptyDocFallback(): Doc {
  return createDoc();
}
