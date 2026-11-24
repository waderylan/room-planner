import type { Item, Unit } from "./types";
import type { Vec2 } from "../geometry/types";
import { centroid, polygonsIntersect } from "../geometry/polygon";
import { worldPolygon } from "../geometry/shape";
import { unitScale } from "./units";

export function isFloorCovering(item: Pick<Item, "height" | "elevation">, unit: Unit): boolean {
  return item.elevation <= 0.001 && item.height <= 0.1 * unitScale("ft", unit);
}

export function canShareFloorSpace(a: Item, b: Item, unit: Unit): boolean {
  return a.hidden || b.hidden || isFloorCovering(a, unit) || isFloorCovering(b, unit) ||
    a.elevation + a.height <= b.elevation + 1e-6 || b.elevation + b.height <= a.elevation + 1e-6;
}

/** Allow edges to touch while still reporting meaningful interior intersections. */
export function footprintInteriorsOverlap(a: Vec2[], b: Vec2[]): boolean {
  const shrink = (poly: Vec2[]) => {
    const center = centroid(poly);
    return poly.map((p) => ({ x: center.x + (p.x - center.x) * 0.99999, y: center.y + (p.y - center.y) * 0.99999 }));
  };
  return polygonsIntersect(shrink(a), shrink(b));
}

export function itemsCollide(a: Item, b: Item, unit: Unit): boolean {
  return !canShareFloorSpace(a, b, unit) && footprintInteriorsOverlap(worldPolygon(a), worldPolygon(b));
}
