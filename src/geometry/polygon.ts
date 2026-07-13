import type { Vec2 } from "./types";

const EPS = 1e-9;

export function polygonArea(poly: Vec2[]): number {
  let sum = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// signed area (positive = CCW in standard math axes; note our y is down/into-room)
export function signedArea(poly: Vec2[]): number {
  let sum = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function centroid(poly: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  area = area / 2;
  if (Math.abs(area) < EPS) {
    // degenerate: fall back to average of vertices
    const avg = poly.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: avg.x / poly.length, y: avg.y / poly.length };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { x: cx, y: cy };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// point lies exactly on the boundary (within eps)
export function pointOnPolygonBoundary(p: Vec2, poly: Vec2[], eps = 1e-6): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    if (segPointDistance(a, b, p) < eps) return true;
  }
  return false;
}

export function polygonContainsPolygon(inner: Vec2[], outer: Vec2[]): boolean {
  for (const p of inner) {
    if (!pointInPolygon(p, outer) && !pointOnPolygonBoundary(p, outer)) return false;
  }
  // also ensure no inner edge crosses an outer edge (concave outer safety)
  const n = inner.length;
  const m = outer.length;
  for (let i = 0; i < n; i++) {
    const a1 = inner[i];
    const a2 = inner[(i + 1) % n];
    for (let j = 0; j < m; j++) {
      const b1 = outer[j];
      const b2 = outer[(j + 1) % m];
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function orient(a: Vec2, b: Vec2, c: Vec2): number {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(v) < EPS) return 0;
  return v > 0 ? 1 : -1;
}

function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    Math.min(a.x, b.x) - EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    Math.min(a.y, b.y) - EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

export function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(a1, a2, b1)) return true;
  if (o2 === 0 && onSegment(a1, a2, b2)) return true;
  if (o3 === 0 && onSegment(b1, b2, a1)) return true;
  if (o4 === 0 && onSegment(b1, b2, a2)) return true;

  return false;
}

// intersect, excluding shared-endpoint touches (used for containment edge checks)
function segmentsProperlyIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  if (!segmentsIntersect(a1, a2, b1, b2)) return false;
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);
  if (o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return true;
  // collinear overlap that is more than a shared point
  return false;
}

/**
 * True if polygons a and b overlap (intersect, or one fully contains the other).
 * Works for concave polygons via edge-crossing + point-in-polygon, not SAT.
 */
export function polygonsIntersect(a: Vec2[], b: Vec2[]): boolean {
  const n = a.length;
  const m = b.length;
  for (let i = 0; i < n; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % n];
    for (let j = 0; j < m; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % m];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return true;
  return false;
}

export function segPointDistance(a: Vec2, b: Vec2, p: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

export function segSegDistance(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    segPointDistance(a1, a2, b1),
    segPointDistance(a1, a2, b2),
    segPointDistance(b1, b2, a1),
    segPointDistance(b1, b2, a2),
  );
}

export function polygonPolygonDistance(a: Vec2[], b: Vec2[]): number {
  if (polygonsIntersect(a, b)) return 0;
  let min = Infinity;
  const n = a.length;
  const m = b.length;
  for (let i = 0; i < n; i++) {
    const a1 = a[i];
    const a2 = a[(i + 1) % n];
    for (let j = 0; j < m; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % m];
      const d = segSegDistance(a1, a2, b1, b2);
      if (d < min) min = d;
    }
  }
  return min;
}

/** Like polygonPolygonDistance but also returns the nearest witness point pair. */
export function polygonPolygonNearest(a: Vec2[], b: Vec2[]): { distance: number; pointA: Vec2; pointB: Vec2 } {
  let best = { distance: Infinity, pointA: a[0], pointB: b[0] };
  const n = a.length;
  const m = b.length;
  for (let i = 0; i < n; i++) {
    const p = a[i];
    for (let j = 0; j < m; j++) {
      const b1 = b[j];
      const b2 = b[(j + 1) % m];
      const closest = nearestPointOnSeg(b1, b2, p);
      const d = Math.hypot(p.x - closest.x, p.y - closest.y);
      if (d < best.distance) best = { distance: d, pointA: p, pointB: closest };
    }
  }
  for (let j = 0; j < m; j++) {
    const p = b[j];
    for (let i = 0; i < n; i++) {
      const a1 = a[i];
      const a2 = a[(i + 1) % n];
      const closest = nearestPointOnSeg(a1, a2, p);
      const d = Math.hypot(p.x - closest.x, p.y - closest.y);
      if (d < best.distance) best = { distance: d, pointA: closest, pointB: p };
    }
  }
  return best;
}

function nearestPointOnSeg(a: Vec2, b: Vec2, p: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq < 1e-9 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function snap(v: number, step: number): number {
  if (step <= 0) return v;
  return Math.round(v / step) * step;
}
