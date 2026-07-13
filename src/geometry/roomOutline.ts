import type { Vec2 } from "./types";
import type { Alcove, RoomShape } from "../model/types";
import { pointInPolygon } from "./polygon";

/**
 * Builds the room floor outline (closed CCW polygon, y = down/into-room) from the
 * base rect/L-shape primitive plus a list of alcove unions. Everything stays
 * axis-aligned, so we rasterize onto a fine grid of covered cells and trace the
 * boundary. This is simple, robust for orthogonal unions, and needs no extra deps.
 */
export function buildOutline(shape: RoomShape, alcoves: Alcove[]): Vec2[] {
  const baseRects = baseRectangles(shape);
  const alcoveRects = alcoves.map((a) => alcoveRectangle(shape, a));
  const rects = [...baseRects, ...alcoveRects];
  return traceUnion(rects);
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function baseRectangles(shape: RoomShape): Rect[] {
  const full: Rect = { x0: 0, y0: 0, x1: shape.width, y1: shape.length };
  if (shape.kind === "rect") return [full];

  const nw = shape.notchWidth ?? 0;
  const nd = shape.notchDepth ?? 0;
  const corner = shape.notchCorner ?? "ne";
  if (nw <= 0 || nd <= 0) return [full];

  // Represent the L as the full rect minus a notch rect, by emitting two rects
  // that cover everything except the notch corner.
  const w = shape.width;
  const l = shape.length;
  switch (corner) {
    case "ne":
      return [
        { x0: 0, y0: 0, x1: w - nw, y1: l },
        { x0: w - nw, y0: nd, x1: w, y1: l },
      ];
    case "nw":
      return [
        { x0: nw, y0: 0, x1: w, y1: l },
        { x0: 0, y0: nd, x1: nw, y1: l },
      ];
    case "se":
      return [
        { x0: 0, y0: 0, x1: w - nw, y1: l },
        { x0: w - nw, y0: 0, x1: w, y1: l - nd },
      ];
    case "sw":
      return [
        { x0: nw, y0: 0, x1: w, y1: l },
        { x0: 0, y0: 0, x1: nw, y1: l - nd },
      ];
  }
}

function alcoveRectangle(shape: RoomShape, a: Alcove): Rect {
  const w = shape.width;
  const l = shape.length;
  switch (a.wall) {
    case "n":
      return { x0: a.offset, y0: -a.depth, x1: a.offset + a.width, y1: 0 };
    case "s":
      return { x0: a.offset, y0: l, x1: a.offset + a.width, y1: l + a.depth };
    case "w":
      return { x0: -a.depth, y0: a.offset, x1: 0, y1: a.offset + a.width };
    case "e":
      return { x0: w, y0: a.offset, x1: w + a.depth, y1: a.offset + a.width };
  }
}

/**
 * Traces the boundary of a union of axis-aligned rectangles using a grid-cell
 * marching approach, then simplifies collinear points. Coordinates are snapped
 * to a fine internal grid so distinct rect edges align exactly.
 */
function traceUnion(rects: Rect[]): Vec2[] {
  if (rects.length === 0) return [];
  if (rects.length === 1) return rectToPoly(rects[0]);

  const xsSet = new Set<number>();
  const ysSet = new Set<number>();
  for (const r of rects) {
    xsSet.add(r.x0);
    xsSet.add(r.x1);
    ysSet.add(r.y0);
    ysSet.add(r.y1);
  }
  const xs = Array.from(xsSet).sort((a, b) => a - b);
  const ys = Array.from(ysSet).sort((a, b) => a - b);

  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const covered: boolean[][] = Array.from({ length: nx }, () => new Array(ny).fill(false));

  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const cx = (xs[ix] + xs[ix + 1]) / 2;
      const cy = (ys[iy] + ys[iy + 1]) / 2;
      for (const r of rects) {
        if (cx > r.x0 && cx < r.x1 && cy > r.y0 && cy < r.y1) {
          covered[ix][iy] = true;
          break;
        }
      }
    }
  }

  // Build the set of boundary edges (edges between covered and uncovered cells).
  type Edge = { a: Vec2; b: Vec2 };
  const edges: Edge[] = [];
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      if (!covered[ix][iy]) continue;
      const x0 = xs[ix];
      const x1 = xs[ix + 1];
      const y0 = ys[iy];
      const y1 = ys[iy + 1];
      const left = ix === 0 || !covered[ix - 1][iy];
      const right = ix === nx - 1 || !covered[ix + 1][iy];
      const top = iy === 0 || !covered[ix][iy - 1];
      const bottom = iy === ny - 1 || !covered[ix][iy + 1];
      if (top) edges.push({ a: { x: x0, y: y0 }, b: { x: x1, y: y0 } });
      if (bottom) edges.push({ a: { x: x1, y: y1 }, b: { x: x0, y: y1 } });
      if (left) edges.push({ a: { x: x0, y: y1 }, b: { x: x0, y: y0 } });
      if (right) edges.push({ a: { x: x1, y: y0 }, b: { x: x1, y: y1 } });
    }
  }

  const poly = stitchEdges(edges);
  return simplifyCollinear(poly);
}

function keyOf(p: Vec2): string {
  return `${p.x.toFixed(6)},${p.y.toFixed(6)}`;
}

function stitchEdges(edges: { a: Vec2; b: Vec2 }[]): Vec2[] {
  const byStart = new Map<string, { a: Vec2; b: Vec2 }[]>();
  for (const e of edges) {
    const k = keyOf(e.a);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k)!.push(e);
  }
  const used = new Set<{ a: Vec2; b: Vec2 }>();
  const start = edges[0];
  const loop: Vec2[] = [start.a];
  let current = start;
  used.add(current);
  for (let guard = 0; guard < edges.length + 5; guard++) {
    loop.push(current.b);
    if (keyOf(current.b) === keyOf(start.a)) break;
    const candidates = byStart.get(keyOf(current.b)) ?? [];
    const next = candidates.find((c) => !used.has(c));
    if (!next) break;
    used.add(next);
    current = next;
  }
  return loop.slice(0, -1);
}

function simplifyCollinear(poly: Vec2[]): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly;
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const cur = poly[i];
    const next = poly[(i + 1) % n];
    const cross = (cur.x - prev.x) * (next.y - cur.y) - (cur.y - prev.y) * (next.x - cur.x);
    const collinear = Math.abs(cross) < 1e-9;
    if (!collinear) out.push(cur);
  }
  return out.length >= 3 ? out : poly;
}

function rectToPoly(r: Rect): Vec2[] {
  return [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
}

export function outlineContainsPoint(outline: Vec2[], p: Vec2): boolean {
  return pointInPolygon(p, outline);
}
