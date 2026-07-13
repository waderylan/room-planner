import type { Vec2 } from "./types";
import type { Item } from "../model/types";
import { localPolygon, worldAxes, worldPolygon } from "./shape";
import { polygonPolygonNearest, centroid } from "./polygon";

export interface WallHit {
  distance: number;
  wallIndex: number;
  pointOnWall: Vec2;
  pointOnItem: Vec2;
}

/** Minimum distance from the item polygon to each wall segment of the room outline. */
export function polygonToWallsDistance(poly: Vec2[], outline: Vec2[]): WallHit {
  let best: WallHit = { distance: Infinity, wallIndex: -1, pointOnWall: outline[0], pointOnItem: poly[0] };
  const n = outline.length;
  const m = poly.length;
  for (let w = 0; w < n; w++) {
    const a = outline[w];
    const b = outline[(w + 1) % n];
    for (let i = 0; i < m; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % m];
      // nearest pair between item edge [p1,p2] and wall edge [a,b]
      const candidates: [Vec2, Vec2][] = [
        [p1, nearestPointOnSegment(a, b, p1)],
        [p2, nearestPointOnSegment(a, b, p2)],
        [nearestPointOnSegment(p1, p2, a), a],
        [nearestPointOnSegment(p1, p2, b), b],
      ];
      for (const [onItem, onWall] of candidates) {
        const d = Math.hypot(onItem.x - onWall.x, onItem.y - onWall.y);
        if (d < best.distance) {
          best = { distance: d, wallIndex: w, pointOnWall: onWall, pointOnItem: onItem };
        }
      }
    }
  }
  return best;
}

function nearestPointOnSegment(a: Vec2, b: Vec2, p: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq < 1e-9 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export type Direction = "left" | "right" | "front" | "back";

export interface DirectionalGap {
  direction: Direction;
  distance: number;
  origin: Vec2;
  hitPoint: Vec2;
  target: "wall" | "furniture";
  targetItemId?: string;
}

function localBBoxEdgeMidpoints(poly: Vec2[]) {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return {
    left: { x: minX, y: midY },
    right: { x: maxX, y: midY },
    back: { x: midX, y: minY },
    front: { x: midX, y: maxY },
  };
}

/** Ray-vs-segment: origin + t*dir intersects [a,b] for t >= 0. Returns t (distance since dir is unit) or null. */
function raySegmentHit(origin: Vec2, dir: Vec2, a: Vec2, b: Vec2): number | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dir.x * ey - dir.y * ex;
  if (Math.abs(denom) < 1e-12) return null;
  const dx = a.x - origin.x;
  const dy = a.y - origin.y;
  const t = (dx * ey - dy * ex) / denom;
  const u = (dx * dir.y - dy * dir.x) / denom;
  if (t < 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return t;
}

function castRay(origin: Vec2, dir: Vec2, polys: Vec2[][]): { distance: number; point: Vec2 } | null {
  let best: { distance: number; point: Vec2 } | null = null;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      const t = raySegmentHit(origin, dir, a, b);
      if (t !== null && (best === null || t < best.distance)) {
        best = { distance: t, point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t } };
      }
    }
  }
  return best;
}

export interface ClearanceResult {
  gaps: DirectionalGap[];
  closest: { distance: number; from: Vec2; to: Vec2; target: "wall" | "furniture"; targetItemId?: string };
}

/**
 * Directional clearance along the item's own local axes (left/right/front/back as oriented),
 * plus the true minimum polygon-to-polygon / polygon-to-wall closest gap.
 */
export function computeClearance(
  item: Item,
  outline: Vec2[],
  otherItems: Item[],
  mode: "wall" | "furniture",
): ClearanceResult {
  const local = localPolygon(item.footprint);
  const mids = localBBoxEdgeMidpoints(local);
  const localCenter = centroid(local);
  const { xAxis, yAxis } = worldAxes(item.rotDeg);

  const toWorld = (p: Vec2): Vec2 => {
    const dx = p.x - localCenter.x;
    const dy = p.y - localCenter.y;
    return {
      x: item.pos.x + localCenter.x + dx * xAxis.x + dy * yAxis.x,
      y: item.pos.y + localCenter.y + dx * xAxis.y + dy * yAxis.y,
    };
  };

  const dirs: { direction: Direction; origin: Vec2; dir: Vec2 }[] = [
    { direction: "right", origin: toWorld(mids.right), dir: xAxis },
    { direction: "left", origin: toWorld(mids.left), dir: { x: -xAxis.x, y: -xAxis.y } },
    { direction: "front", origin: toWorld(mids.front), dir: yAxis },
    { direction: "back", origin: toWorld(mids.back), dir: { x: -yAxis.x, y: -yAxis.y } },
  ];

  const otherPolys = otherItems
    .filter((o) => o.id !== item.id && !o.hidden)
    .map((o) => ({ id: o.id, poly: worldPolygon(o) }));

  const gaps: DirectionalGap[] = dirs.map(({ direction, origin, dir }) => {
    const wallHit = castRay(origin, dir, [outline]);
    let furnitureHit: { distance: number; point: Vec2; id: string } | null = null;
    if (mode === "furniture") {
      for (const { id, poly } of otherPolys) {
        const hit = castRay(origin, dir, [poly]);
        if (hit && (furnitureHit === null || hit.distance < furnitureHit.distance)) {
          furnitureHit = { ...hit, id };
        }
      }
    }
    if (furnitureHit && (!wallHit || furnitureHit.distance < wallHit.distance)) {
      return {
        direction,
        distance: furnitureHit.distance,
        origin,
        hitPoint: furnitureHit.point,
        target: "furniture",
        targetItemId: furnitureHit.id,
      };
    }
    if (wallHit) {
      return { direction, distance: wallHit.distance, origin, hitPoint: wallHit.point, target: "wall" };
    }
    return { direction, distance: 0, origin, hitPoint: origin, target: "wall" };
  });

  const itemPoly = worldPolygon(item);
  const wallDist = polygonToWallsDistance(itemPoly, outline);
  let closest: ClearanceResult["closest"] = {
    distance: wallDist.distance,
    from: wallDist.pointOnItem,
    to: wallDist.pointOnWall,
    target: "wall",
    targetItemId: undefined,
  };

  if (mode === "furniture") {
    for (const { id, poly } of otherPolys) {
      const nearest = polygonPolygonNearest(itemPoly, poly);
      if (nearest.distance < closest.distance) {
        closest = {
          distance: nearest.distance,
          from: nearest.pointA,
          to: nearest.pointB,
          target: "furniture" as const,
          targetItemId: id,
        };
      }
    }
  }

  return { gaps, closest };
}
