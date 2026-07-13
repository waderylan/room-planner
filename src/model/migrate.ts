import { v4 as uuid } from "uuid";
import type { Doc, Opening } from "./types";
import { buildOutline } from "../geometry/roomOutline";
import { clampOpening } from "../geometry/openings";
import { createDoc } from "./factory";

/**
 * Validates and migrates an arbitrary parsed JSON value into the current Doc shape.
 * Throws with a human-readable message on anything unrecoverable; callers should
 * catch and surface a toast rather than crash.
 */
export function migrateDoc(raw: unknown): Doc {
  if (!raw || typeof raw !== "object") throw new Error("File is not a valid room planner document.");
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.rooms) || obj.rooms.length === 0) {
    throw new Error("Document has no rooms.");
  }

  const version = typeof obj.version === "number" ? obj.version : 1;

  // v1/v2 legacy prototype shapes are not directly compatible (different room
  // model entirely); if we see something clearly not ours, bail with a clear error.
  const rooms = obj.rooms.map((r) => migrateRoom(r as Record<string, unknown>));

  const activeRoomId =
    typeof obj.activeRoomId === "string" && rooms.some((r) => r.id === obj.activeRoomId)
      ? obj.activeRoomId
      : rooms[0].id;

  void version;
  return { version: 4, rooms, activeRoomId };
}

function migrateOpening(raw: unknown, outline: Doc["rooms"][number]["outline"], ceiling: number): Opening | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind === "door" ? "door" : o.kind === "window" ? "window" : null;
  if (!kind) return null;
  const draft: Opening = {
    id: typeof o.id === "string" ? o.id : uuid(),
    kind,
    wallIndex: typeof o.wallIndex === "number" ? o.wallIndex : 0,
    offset: typeof o.offset === "number" ? o.offset : 0,
    width: typeof o.width === "number" ? o.width : 3,
    height: typeof o.height === "number" ? o.height : kind === "door" ? 6.67 : 3.5,
    sillHeight: typeof o.sillHeight === "number" ? o.sillHeight : kind === "door" ? 0 : 3,
    hinge: o.hinge === "right" ? "right" : "left",
  };
  return clampOpening(outline, ceiling, draft);
}

function migrateRoom(r: Record<string, unknown>): Doc["rooms"][number] {
  if (typeof r.id !== "string" || typeof r.name !== "string") {
    throw new Error("Malformed room in document.");
  }
  const shape = (r.shape as Doc["rooms"][number]["shape"]) ?? { kind: "rect", width: 12, length: 10 };
  const alcoves = Array.isArray(r.alcoves) ? (r.alcoves as Doc["rooms"][number]["alcoves"]) : [];
  const outline =
    Array.isArray(r.outline) && r.outline.length >= 3
      ? (r.outline as Doc["rooms"][number]["outline"])
      : buildOutline(shape, alcoves);
  const ceiling = typeof r.ceiling === "number" ? r.ceiling : 8;
  const openings = Array.isArray(r.openings)
    ? r.openings.map((o) => migrateOpening(o, outline, ceiling)).filter((o): o is Opening => o !== null)
    : [];

  return {
    id: r.id,
    name: r.name,
    unit: r.unit === "m" ? "m" : "ft",
    shape,
    alcoves,
    openings,
    outline,
    ceiling,
    items: Array.isArray(r.items) ? (r.items as Doc["rooms"][number]["items"]) : [],
    selectedItemId: null,
    measureMode: r.measureMode === "furniture" ? "furniture" : "wall",
  };
}

export function safeParseDoc(json: string): Doc {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  return migrateDoc(parsed);
}

export function emptyDocFallback(): Doc {
  return createDoc();
}
