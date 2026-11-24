import type { Footprint, Item, Room, Unit } from "./types";

export function unitScale(from: Unit, to: Unit): number {
  return from === to ? 1 : from === "ft" ? 0.3048 : 1 / 0.3048;
}

export function scaleFootprint(footprint: Footprint, factor: number): Footprint {
  if (footprint.kind === "rect") return { kind: "rect", w: footprint.w * factor, d: footprint.d * factor };
  if (footprint.kind === "circle") return { kind: "circle", r: footprint.r * factor };
  return { kind: "poly", points: footprint.points.map((p) => ({ x: p.x * factor, y: p.y * factor })) };
}

export function convertItem(item: Item, from: Unit, to: Unit): Item {
  const factor = unitScale(from, to);
  if (factor === 1) return item;
  return {
    ...item,
    footprint: scaleFootprint(item.footprint, factor),
    pos: { x: item.pos.x * factor, y: item.pos.y * factor },
    height: item.height * factor,
    elevation: item.elevation * factor,
  };
}

/** Converts every linear measurement; room area consequently scales quadratically. */
export function convertRoom(room: Room, unit: Unit): Room {
  const factor = unitScale(room.unit, unit);
  if (factor === 1) return room;
  return {
    ...room,
    unit,
    ceiling: room.ceiling * factor,
    shape: {
      ...room.shape,
      width: room.shape.width * factor,
      length: room.shape.length * factor,
      ...(room.shape.notchWidth === undefined ? {} : { notchWidth: room.shape.notchWidth * factor }),
      ...(room.shape.notchDepth === undefined ? {} : { notchDepth: room.shape.notchDepth * factor }),
    },
    outline: room.outline.map((p) => ({ x: p.x * factor, y: p.y * factor })),
    alcoves: room.alcoves.map((a) => ({ ...a, offset: a.offset * factor, width: a.width * factor, depth: a.depth * factor })),
    openings: room.openings.map((o) => ({ ...o, offset: o.offset * factor, width: o.width * factor, height: o.height * factor, sillHeight: o.sillHeight * factor })),
    items: room.items.map((item) => convertItem(item, room.unit, unit)),
  };
}
