import type { Vec2 } from "./types";
import type { Footprint, Item } from "../model/types";
import { centroid, pointInPolygon, polygonContainsPolygon, segPointDistance } from "./polygon";

const CIRCLE_SEGMENTS = 48;

/** Footprint polygon in the item's own local coordinate space (origin at item.pos). */
export function localPolygon(footprint: Footprint): Vec2[] {
  switch (footprint.kind) {
    case "rect":
      return [
        { x: 0, y: 0 },
        { x: footprint.w, y: 0 },
        { x: footprint.w, y: footprint.d },
        { x: 0, y: footprint.d },
      ];
    case "circle": {
      const pts: Vec2[] = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        pts.push({ x: footprint.r + footprint.r * Math.cos(t), y: footprint.r + footprint.r * Math.sin(t) });
      }
      return pts;
    }
    case "poly":
      return footprint.points;
  }
}

/** Bounding footprint size (width, depth) in local space, used for UI/default placement. */
export function footprintSize(footprint: Footprint): { w: number; d: number } {
  if (footprint.kind === "rect") return { w: footprint.w, d: footprint.d };
  if (footprint.kind === "circle") return { w: footprint.r * 2, d: footprint.r * 2 };
  const xs = footprint.points.map((p) => p.x);
  const ys = footprint.points.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
}

function rotatePoint(p: Vec2, center: Vec2, rotDeg: number): Vec2 {
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Item footprint transformed to world space: rotated about its local-bbox center, then translated by pos. */
export function worldPolygon(item: Pick<Item, "footprint" | "pos" | "rotDeg">): Vec2[] {
  const local = localPolygon(item.footprint);
  const center = centroid(local);
  const rotated = local.map((p) => rotatePoint(p, center, item.rotDeg));
  return rotated.map((p) => ({ x: p.x + item.pos.x, y: p.y + item.pos.y }));
}

/** World-space local axis vectors (unit) for the item's own +X (right) and +Y (down/front). */
export function worldAxes(rotDeg: number): { xAxis: Vec2; yAxis: Vec2 } {
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    xAxis: { x: cos, y: sin },
    yAxis: { x: -sin, y: cos },
  };
}

/**
 * Given an item being resized (footprint center moving from oldCenter to newCenter, in local
 * footprint space), compute the new `pos` that keeps a chosen anchor point fixed in world space.
 * `anchorLocalOld`/`anchorLocalNew` are the same physical point expressed in the old and new
 * local footprint spaces (e.g. the opposite edge/corner from the one being dragged, or the
 * center itself for a symmetric resize). Mirrors the rotate-about-center-then-translate model
 * used by `worldPolygon`.
 */
export function repositionForResize(
  pos: Vec2,
  rotDeg: number,
  oldCenter: Vec2,
  newCenter: Vec2,
  anchorLocalOld: Vec2,
  anchorLocalNew: Vec2,
): Vec2 {
  const { xAxis, yAxis } = worldAxes(rotDeg);
  const toWorld = (v: Vec2): Vec2 => ({
    x: v.x * xAxis.x + v.y * yAxis.x,
    y: v.x * xAxis.y + v.y * yAxis.y,
  });
  const anchorWorld = {
    x: pos.x + oldCenter.x + toWorld({ x: anchorLocalOld.x - oldCenter.x, y: anchorLocalOld.y - oldCenter.y }).x,
    y: pos.y + oldCenter.y + toWorld({ x: anchorLocalOld.x - oldCenter.x, y: anchorLocalOld.y - oldCenter.y }).y,
  };
  const rotNew = toWorld({ x: anchorLocalNew.x - newCenter.x, y: anchorLocalNew.y - newCenter.y });
  return { x: anchorWorld.x - newCenter.x - rotNew.x, y: anchorWorld.y - newCenter.y - rotNew.y };
}

export function worldCenter(item: Pick<Item, "footprint" | "pos" | "rotDeg">): Vec2 {
  const local = localPolygon(item.footprint);
  const c = centroid(local);
  return { x: c.x + item.pos.x, y: c.y + item.pos.y };
}

export function isFullyInside(itemPoly: Vec2[], outline: Vec2[]): boolean {
  return polygonContainsPolygon(itemPoly, outline);
}

/** Nudge item.pos so its world polygon lies inside the outline, when possible. */
export function clampPolygonInside(item: Item, outline: Vec2[]): Vec2 {
  let poly = worldPolygon(item);
  if (isFullyInside(poly, outline)) return item.pos;

  const outXs = outline.map((p) => p.x);
  const outYs = outline.map((p) => p.y);
  const minX = Math.min(...outXs);
  const maxX = Math.max(...outXs);
  const minY = Math.min(...outYs);
  const maxY = Math.max(...outYs);

  let pos = { ...item.pos };
  const polyXs = poly.map((p) => p.x);
  const polyYs = poly.map((p) => p.y);
  let dx = 0;
  let dy = 0;
  if (Math.min(...polyXs) < minX) dx += minX - Math.min(...polyXs);
  if (Math.max(...polyXs) > maxX) dx += maxX - Math.max(...polyXs);
  if (Math.min(...polyYs) < minY) dy += minY - Math.min(...polyYs);
  if (Math.max(...polyYs) > maxY) dy += maxY - Math.max(...polyYs);
  pos = { x: pos.x + dx, y: pos.y + dy };

  return pos;
}

export function pointInsideOutline(p: Vec2, outline: Vec2[]): boolean {
  return pointInPolygon(p, outline);
}

/** Clamp an arbitrary world point to the nearest point inside (or on) the outline polygon. */
export function clampPointInsideOutline(p: Vec2, outline: Vec2[]): Vec2 {
  if (pointInPolygon(p, outline)) return p;
  let best = outline[0];
  let bestDist = Infinity;
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq < 1e-9 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cand = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - cand.x, p.y - cand.y);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best;
}

export { segPointDistance };
