import { createDoc, createRoom, itemFromPreset } from "./factory";
import { FURNITURE_PRESETS } from "./presets";
import { buildOutline } from "../geometry/roomOutline";
import type { Doc, Item } from "./types";

export type TemplateId = "empty" | "living" | "bedroom" | "office";
export const ROOM_TEMPLATES: {
  id: TemplateId;
  name: string;
  width: number;
  length: number;
}[] = [
  { id: "empty", name: "Empty room", width: 12, length: 10 },
  { id: "living", name: "Living room", width: 18, length: 15 },
  { id: "bedroom", name: "Bedroom", width: 14, length: 14 },
  { id: "office", name: "Home office", width: 14, length: 11 },
];

export function createFromTemplate(id: TemplateId): Doc {
  if (id === "empty") return createDoc();
  const template = ROOM_TEMPLATES.find((t) => t.id === id)!;
  const room = createRoom(template.name);
  room.shape = { kind: "rect", width: template.width, length: template.length };
  room.outline = buildOutline(room.shape, []);
  const add = (
    presetId: string,
    x: number,
    y: number,
    color: string,
    rotation = 0,
  ) => {
    const preset = FURNITURE_PRESETS.find((p) => p.id === presetId)!;
    const item: Item = {
      ...itemFromPreset(preset, room),
      pos: { x, y },
      color,
      rotDeg: rotation,
    };
    room.items.push(item);
  };
  if (id === "living") {
    add("sofa", 1, 1, "#9aaeb9");
    add("coffee-table", 2, 5.5, "#c0ac91");
    add("armchair", 10, 2, "#b5b5ac");
    add("tv-stand", 1.5, 12.5, "#91918d");
    add("plant", 14, 1, "#93a58b");
    add("bookshelf", 14, 10, "#bdac95");
  } else if (id === "bedroom") {
    add("bed-queen", 4.5, 1, "#a5b6b0");
    add("nightstand", 2, 1.5, "#c1af97");
    add("nightstand", 10.5, 1.5, "#c1af97");
    add("dresser", 1, 11, "#b5a68f");
    add("armchair", 10, 10, "#adb4b9");
    add("plant", 1, 7, "#93a58b");
  } else {
    add("desk", 4.5, 0.5, "#c0ad93");
    add("dining-chair", 6, 3.5, "#a7adb8");
    add("bookshelf", 0.5, 0.5, "#b5a68f");
    add("loveseat", 1, 7, "#a6b4bd");
    add("plant", 11, 0.5, "#93a58b");
  }
  room.openings = [
    {
      id: crypto.randomUUID(),
      kind: "door",
      wallIndex: 2,
      offset: 1,
      width: 3,
      height: 6.67,
      sillHeight: 0,
      hinge: "left",
    },
    {
      id: crypto.randomUUID(),
      kind: "window",
      wallIndex: 1,
      offset: 4,
      width: 4,
      height: 3.5,
      sillHeight: 3,
      hinge: "left",
    },
  ];
  return { version: 4, rooms: [room], activeRoomId: room.id };
}
