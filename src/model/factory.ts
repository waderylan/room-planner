import { v4 as uuid } from "uuid";
import type { Doc, Item, Room, RoomShape } from "./types";
import type { FurniturePreset } from "./presets";
import { buildOutline } from "../geometry/roomOutline";
import { findFreeSpot } from "./freeSpot";
import { scaleFootprint, unitScale } from "./units";

export function defaultRoomShape(): RoomShape {
  return { kind: "rect", width: 12, length: 10 };
}

export function createRoom(name: string): Room {
  const shape = defaultRoomShape();
  return {
    id: uuid(),
    name,
    unit: "ft",
    shape,
    alcoves: [],
    openings: [],
    outline: buildOutline(shape, []),
    ceiling: 8,
    items: [],
    selectedItemId: null,
    measureMode: "wall",
  };
}

export function createDoc(): Doc {
  const room = createRoom("Living Room");
  return {
    version: 4,
    rooms: [room],
    activeRoomId: room.id,
  };
}

export function itemFromPreset(preset: FurniturePreset, room: Room): Item {
  const factor = unitScale("ft", room.unit);
  const item: Item = {
    id: uuid(),
    name: preset.name,
    presetId: preset.id,
    footprint: scaleFootprint(preset.footprint, factor),
    pos: { x: 0, y: 0 },
    rotDeg: 0,
    height: preset.height * factor,
    elevation: (preset.elevation ?? 0) * factor,
    color: preset.color,
    hidden: false,
  };
  item.pos = findFreeSpot(room, item);
  return item;
}

export function cloneItem(item: Item, offset = 0.5): Item {
  return {
    ...item,
    id: uuid(),
    name: item.name.endsWith(" copy") ? item.name : `${item.name} copy`,
    pos: { x: item.pos.x + offset, y: item.pos.y + offset },
  };
}
