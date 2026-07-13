import type { Item, Room } from "./types";
import { worldPolygon, isFullyInside } from "../geometry/shape";
import { polygonsIntersect } from "../geometry/polygon";
import type { Vec2 } from "../geometry/types";

const STEP = 0.5;

/** Finds the first free grid spot in the room where the item fits without overlap or going out of bounds. */
export function findFreeSpot(room: Room, item: Item): Vec2 {
  const xs = room.outline.map((p) => p.x);
  const ys = room.outline.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const otherPolys = room.items.filter((o) => o.id !== item.id).map((o) => worldPolygon(o));

  for (let y = minY; y <= maxY; y += STEP) {
    for (let x = minX; x <= maxX; x += STEP) {
      const candidate: Item = { ...item, pos: { x, y } };
      const poly = worldPolygon(candidate);
      if (!isFullyInside(poly, room.outline)) continue;
      const overlaps = otherPolys.some((other) => polygonsIntersect(poly, other));
      if (!overlaps) return { x, y };
    }
  }
  // fall back to room center even if it overlaps; user can move it
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
