import { v4 as uuid } from "uuid";
import { useStore } from "../store/store";
import { FURNITURE_PRESETS, CUSTOM_PRESET } from "../model/presets";
import { wallSegments } from "../geometry/openings";
import { worldPolygon } from "../geometry/shape";
import type { AlcoveWall, DoorHinge, Item, OpeningKind, RoomShape } from "../model/types";
import type { Align, Corner, PlacementSpec, WallSide } from "./placement";
import { computePlacement, interiorsOverlap, isFlat, itemCenter, roomBounds, roomIssues } from "./placement";

class ToolError extends Error {}

function requireString(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  if (typeof v !== "string" || !v) throw new ToolError(`Missing required string "${key}"`);
  return v;
}

function requireNumber(input: Record<string, unknown>, key: string): number {
  const v = input[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ToolError(`Missing required number "${key}"`);
  return v;
}

function optNumber(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function optString(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" ? v : undefined;
}

function optBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const v = input[key];
  return typeof v === "boolean" ? v : undefined;
}

function getRoomState() {
  const room = useStore.getState().activeRoom();
  const walls = wallSegments(room.outline).map((w) => ({
    index: w.index,
    from: w.a,
    to: w.b,
    length: Number(w.length.toFixed(3)),
  }));
  return {
    name: room.name,
    unit: room.unit,
    shape: room.shape,
    ceiling: room.ceiling,
    outline: room.outline,
    walls,
    alcoves: room.alcoves,
    openings: room.openings,
    items: room.items.map((it) => ({
      id: it.id,
      name: it.name,
      footprint: it.footprint,
      pos: it.pos,
      rotDeg: it.rotDeg,
      height: it.height,
      elevation: it.elevation,
      color: it.color,
      hidden: it.hidden,
    })),
  };
}

function listPresets() {
  return [...FURNITURE_PRESETS, CUSTOM_PRESET].map((p) => ({
    id: p.id,
    name: p.name,
    footprint: p.footprint,
    height: p.height,
    color: p.color,
  }));
}

function findPreset(presetId: string) {
  if (presetId === "custom") return CUSTOM_PRESET;
  const preset = FURNITURE_PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new ToolError(`Unknown presetId "${presetId}". Call list_presets to see valid ids.`);
  return preset;
}

function applyFootprintOverride(id: string, width: number | undefined, depth: number | undefined) {
  if (width === undefined && depth === undefined) return;
  const store = useStore.getState();
  const item = store.activeRoom().items.find((it) => it.id === id);
  if (!item || item.footprint.kind !== "rect") return;
  store.updateItem(id, {
    footprint: { kind: "rect", w: width ?? item.footprint.w, d: depth ?? item.footprint.d },
  });
  const moved = store.activeRoom().items.find((it) => it.id === id);
  if (moved) store.moveItem(id, moved.pos, { skipSnap: true });
}

function addItem(input: Record<string, unknown>) {
  const presetId = requireString(input, "presetId");
  const preset = findPreset(presetId);
  const store = useStore.getState();
  store.addItemFromPreset(preset);
  const room = store.activeRoom();
  const item = room.items.find((it) => it.id === room.selectedItemId);
  if (!item) throw new ToolError("Failed to add item");
  const id = item.id;

  const patch: Record<string, unknown> = {};
  const name = optString(input, "name");
  const color = optString(input, "color");
  const height = optNumber(input, "height");
  const elevation = optNumber(input, "elevation");
  if (name) patch.name = name;
  if (color) patch.color = color;
  if (height !== undefined) patch.height = height;
  if (elevation !== undefined) patch.elevation = elevation;
  if (Object.keys(patch).length > 0) store.updateItem(id, patch);

  applyFootprintOverride(id, optNumber(input, "width"), optNumber(input, "depth"));

  const rotDeg = optNumber(input, "rotDeg");
  if (rotDeg !== undefined) store.rotateItem(id, rotDeg);

  const x = optNumber(input, "x");
  const y = optNumber(input, "y");
  if (x !== undefined || y !== undefined) {
    const current = store.activeRoom().items.find((it) => it.id === id);
    if (current) store.moveItem(id, { x: x ?? current.pos.x, y: y ?? current.pos.y }, { skipSnap: true });
  }

  const final = store.activeRoom().items.find((it) => it.id === id);
  return { id, item: final, overlaps: overlapsOthers(id) };
}

/** Report whether an item currently overlaps any other (non-hidden) item. */
function overlapsOthers(id: string): boolean {
  const room = useStore.getState().activeRoom();
  const self = room.items.find((it) => it.id === id);
  if (!self || isFlat(self)) return false;
  const selfPoly = worldPolygon(self);
  return room.items.some(
    (o) => o.id !== id && !o.hidden && !isFlat(o) && interiorsOverlap(selfPoly, worldPolygon(o)),
  );
}

function describeWalls() {
  const room = useStore.getState().activeRoom();
  const b = roomBounds(room);
  const eps = 1e-6;
  return wallSegments(room.outline).map((w) => {
    const a = w.a;
    const end = w.b;
    const horizontal = Math.abs(a.y - end.y) < eps;
    const vertical = Math.abs(a.x - end.x) < eps;
    let side: WallSide | "angled" = "angled";
    let inward = "";
    if (horizontal) {
      if (Math.abs(a.y - b.minY) < eps) {
        side = "n";
        inward = "+y (south, into the room)";
      } else if (Math.abs(a.y - b.maxY) < eps) {
        side = "s";
        inward = "-y (north, into the room)";
      }
    } else if (vertical) {
      if (Math.abs(a.x - b.minX) < eps) {
        side = "w";
        inward = "+x (east, into the room)";
      } else if (Math.abs(a.x - b.maxX) < eps) {
        side = "e";
        inward = "-x (west, into the room)";
      }
    }
    return {
      wallIndex: w.index,
      side,
      inward,
      from: { x: Number(a.x.toFixed(2)), y: Number(a.y.toFixed(2)) },
      to: { x: Number(end.x.toFixed(2)), y: Number(end.y.toFixed(2)) },
      length: Number(w.length.toFixed(2)),
    };
  });
}

function buildSpec(input: Record<string, unknown>): PlacementSpec {
  const placement = requireString(input, "placement");
  const align = (optString(input, "align") as Align | undefined) ?? "center";
  const gap = optNumber(input, "gap") ?? 0;
  const rotDeg = optNumber(input, "rotDeg");
  switch (placement) {
    case "wall": {
      const wall = optString(input, "wall") as WallSide | undefined;
      if (!wall) throw new ToolError('placement="wall" requires "wall" (n/e/s/w).');
      return { kind: "wall", wall, align, gap, rotDeg };
    }
    case "corner": {
      const corner = optString(input, "corner") as Corner | undefined;
      if (!corner) throw new ToolError('placement="corner" requires "corner" (nw/ne/sw/se).');
      return { kind: "corner", corner, gap, rotDeg };
    }
    case "center":
      return { kind: "center", rotDeg };
    case "beside": {
      const refId = optString(input, "ref");
      if (!refId) throw new ToolError('placement="beside" requires "ref" (the id of the item to place next to).');
      const side = optString(input, "side") as WallSide | undefined;
      if (!side) throw new ToolError('placement="beside" requires "side" (n/e/s/w) relative to the reference item.');
      return { kind: "beside", refId, side, align, gap, rotDeg };
    }
    default:
      throw new ToolError(`Unknown placement "${placement}". Use wall, corner, center, or beside.`);
  }
}

function summarizeItem(item: Item | undefined, adjusted: boolean, placed: boolean) {
  if (!item) throw new ToolError("Failed to resolve item after placement.");
  return {
    id: item.id,
    name: item.name,
    center: itemCenter(item),
    pos: { x: Number(item.pos.x.toFixed(2)), y: Number(item.pos.y.toFixed(2)) },
    rotDeg: item.rotDeg,
    adjusted,
    overlaps: !placed,
    note: placed
      ? adjusted
        ? "The exact target was occupied, so it was moved to the nearest free spot."
        : "Placed exactly as requested, no overlap."
      : "Could not find any free spot; the room may be too full. This piece overlaps something.",
  };
}

function placeItem(input: Record<string, unknown>) {
  const presetId = requireString(input, "presetId");
  const preset = findPreset(presetId);
  const spec = buildSpec(input);
  const store = useStore.getState();
  store.addItemFromPreset(preset);
  const room = store.activeRoom();
  const created = room.items.find((it) => it.id === room.selectedItemId);
  if (!created) throw new ToolError("Failed to add item");
  const id = created.id;

  const patch: Record<string, unknown> = {};
  const name = optString(input, "name");
  const color = optString(input, "color");
  const height = optNumber(input, "height");
  const elevation = optNumber(input, "elevation");
  if (name) patch.name = name;
  if (color) patch.color = color;
  if (height !== undefined) patch.height = height;
  if (elevation !== undefined) patch.elevation = elevation;
  if (Object.keys(patch).length > 0) store.updateItem(id, patch);

  applyFootprintOverride(id, optNumber(input, "width"), optNumber(input, "depth"));

  const item = store.activeRoom().items.find((it) => it.id === id);
  if (!item) throw new ToolError("Failed to add item");
  const result = computePlacement(store.activeRoom(), item.footprint, spec, id, isFlat(item));
  store.rotateItem(id, result.rotDeg);
  store.moveItem(id, result.pos, { skipSnap: true });

  const final = store.activeRoom().items.find((it) => it.id === id);
  return summarizeItem(final, result.adjusted, result.placed);
}

function moveByPlacement(input: Record<string, unknown>) {
  const id = requireString(input, "id");
  const store = useStore.getState();
  const item = store.activeRoom().items.find((it) => it.id === id);
  if (!item) throw new ToolError(`No item with id "${id}" in the active room.`);
  const spec = buildSpec(input);
  const result = computePlacement(store.activeRoom(), item.footprint, spec, id, isFlat(item));
  store.rotateItem(id, result.rotDeg);
  store.moveItem(id, result.pos, { skipSnap: true });
  const final = store.activeRoom().items.find((it) => it.id === id);
  return summarizeItem(final, result.adjusted, result.placed);
}

function updateItem(input: Record<string, unknown>) {
  const id = requireString(input, "id");
  const store = useStore.getState();
  const item = store.activeRoom().items.find((it) => it.id === id);
  if (!item) throw new ToolError(`No item with id "${id}" in the active room.`);

  const patch: Record<string, unknown> = {};
  const name = optString(input, "name");
  const color = optString(input, "color");
  const height = optNumber(input, "height");
  const elevation = optNumber(input, "elevation");
  const hidden = optBoolean(input, "hidden");
  if (name) patch.name = name;
  if (color) patch.color = color;
  if (height !== undefined) patch.height = height;
  if (elevation !== undefined) patch.elevation = elevation;
  if (hidden !== undefined) patch.hidden = hidden;
  if (Object.keys(patch).length > 0) store.updateItem(id, patch);

  applyFootprintOverride(id, optNumber(input, "width"), optNumber(input, "depth"));

  const rotDeg = optNumber(input, "rotDeg");
  if (rotDeg !== undefined) store.rotateItem(id, rotDeg);

  const x = optNumber(input, "x");
  const y = optNumber(input, "y");
  if (x !== undefined || y !== undefined) {
    const current = store.activeRoom().items.find((it) => it.id === id);
    if (current) store.moveItem(id, { x: x ?? current.pos.x, y: y ?? current.pos.y }, { skipSnap: true });
  }

  const final = store.activeRoom().items.find((it) => it.id === id);
  return { id, item: final };
}

function addOpening(input: Record<string, unknown>) {
  const store = useStore.getState();
  const wallCount = wallSegments(store.activeRoom().outline).length;
  const wallIndex = requireNumber(input, "wallIndex");
  if (wallIndex < 0 || wallIndex >= wallCount) {
    throw new ToolError(`wallIndex ${wallIndex} is out of range; this room has ${wallCount} walls (0..${wallCount - 1}).`);
  }
  const id = uuid();
  store.addOpening({
    id,
    kind: requireString(input, "kind") as OpeningKind,
    wallIndex,
    offset: requireNumber(input, "offset"),
    width: requireNumber(input, "width"),
    height: requireNumber(input, "height"),
    sillHeight: requireNumber(input, "sillHeight"),
    hinge: (optString(input, "hinge") as DoorHinge | undefined) ?? "left",
  });
  return { id };
}

export function executeTool(name: string, input: Record<string, unknown>): unknown {
  const store = useStore.getState();
  switch (name) {
    case "get_room_state":
      return getRoomState();
    case "list_presets":
      return listPresets();
    case "describe_walls":
      return describeWalls();
    case "set_room_shape": {
      const kind = requireString(input, "kind");
      const shape: RoomShape =
        kind === "lshape"
          ? {
              kind: "lshape",
              width: requireNumber(input, "width"),
              length: requireNumber(input, "length"),
              notchCorner: (optString(input, "notchCorner") as RoomShape["notchCorner"]) ?? "ne",
              notchWidth: optNumber(input, "notchWidth") ?? 2,
              notchDepth: optNumber(input, "notchDepth") ?? 2,
            }
          : { kind: "rect", width: requireNumber(input, "width"), length: requireNumber(input, "length") };
      store.setRoomShape(shape);
      return { ok: true, shape };
    }
    case "set_room_unit":
      store.setRoomUnit(requireString(input, "unit") as "ft" | "m");
      return { ok: true };
    case "set_ceiling":
      store.setRoomCeiling(requireNumber(input, "height"));
      return { ok: true };
    case "add_alcove": {
      store.addAlcove({
        wall: requireString(input, "wall") as AlcoveWall,
        offset: requireNumber(input, "offset"),
        width: requireNumber(input, "width"),
        depth: requireNumber(input, "depth"),
      });
      return { ok: true };
    }
    case "remove_alcove":
      store.removeAlcove(requireString(input, "id"));
      return { ok: true };
    case "add_opening":
      return addOpening(input);
    case "remove_opening":
      store.removeOpening(requireString(input, "id"));
      return { ok: true };
    case "add_item":
      return addItem(input);
    case "place_item":
      return placeItem(input);
    case "move_item":
      return moveByPlacement(input);
    case "check_room":
      return roomIssues(store.activeRoom());
    case "clear_items": {
      const room = store.activeRoom();
      const count = room.items.length;
      for (const it of [...room.items]) store.deleteItem(it.id);
      return { ok: true, removed: count };
    }
    case "update_item":
      return updateItem(input);
    case "remove_item":
      store.deleteItem(requireString(input, "id"));
      return { ok: true };
    default:
      throw new ToolError(`Unknown tool "${name}"`);
  }
}
