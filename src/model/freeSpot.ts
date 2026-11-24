import type { Item, Room } from "./types";
import { worldPolygon, isFullyInside, localPolygon } from "../geometry/shape";
import { centroid } from "../geometry/polygon";
import type { Vec2 } from "../geometry/types";
import { canShareFloorSpace, footprintInteriorsOverlap } from "./collision";
import { unitScale } from "./units";

/** Bounded, unit-aware placement search; rugs and elevated pieces can share floor space. */
export function findFreeSpot(room: Room, item: Item): Vec2 {
  const xs = room.outline.map((p) => p.x);
  const ys = room.outline.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // At most 81 × 81 candidates, even for a very large imported room.
  const step = Math.max(0.5 * unitScale("ft", room.unit), (maxX - minX) / 80, (maxY - minY) / 80);
  const otherPolys = room.items.filter((other) => other.id !== item.id && !canShareFloorSpace(item, other, room.unit)).map(worldPolygon);

  for (let y = minY; y <= maxY + 1e-9; y += step) {
    for (let x = minX; x <= maxX + 1e-9; x += step) {
      const poly = worldPolygon({ ...item, pos: { x, y } });
      if (!isFullyInside(poly, room.outline)) continue;
      if (!otherPolys.some((other) => footprintInteriorsOverlap(poly, other))) return { x, y };
    }
  }
  const center = centroid(room.outline);
  const itemCenter = centroid(localPolygon(item.footprint));
  return { x: center.x - itemCenter.x, y: center.y - itemCenter.y };
}
