import type { Vec2 } from "./types";
import type { NotchCorner } from "../model/types";

/**
 * Builds a 6-point L-shaped polygon: an overall W x D rectangle with a
 * notchWidth x notchDepth rectangle removed from the given corner.
 * Shared by the room L-shape editor and the furniture L-shape editor.
 */
export function lShapePolygon(overallW: number, overallD: number, corner: NotchCorner, notchWidth: number, notchDepth: number): Vec2[] {
  const w = Math.max(overallW, 0.01);
  const d = Math.max(overallD, 0.01);
  const nw = Math.min(Math.max(notchWidth, 0), w - 0.01);
  const nd = Math.min(Math.max(notchDepth, 0), d - 0.01);

  if (nw <= 0 || nd <= 0) {
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ];
  }

  switch (corner) {
    // "nw" = top-left corner cut away (y=0 is top/back)
    case "nw":
      return [
        { x: nw, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d },
        { x: 0, y: d },
        { x: 0, y: nd },
        { x: nw, y: nd },
      ];
    case "ne":
      return [
        { x: 0, y: 0 },
        { x: w - nw, y: 0 },
        { x: w - nw, y: nd },
        { x: w, y: nd },
        { x: w, y: d },
        { x: 0, y: d },
      ];
    case "sw":
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d },
        { x: nw, y: d },
        { x: nw, y: d - nd },
        { x: 0, y: d - nd },
      ];
    case "se":
      return [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: d - nd },
        { x: w - nw, y: d - nd },
        { x: w - nw, y: d },
        { x: 0, y: d },
      ];
  }
}

export interface LShapeParams {
  overallW: number;
  overallD: number;
  notchCorner: NotchCorner;
  notchWidth: number;
  notchDepth: number;
}

const EPS = 1e-6;
const has = (points: Vec2[], x: number, y: number) => points.some((p) => Math.abs(p.x - x) < EPS && Math.abs(p.y - y) < EPS);

/**
 * Inverse of lShapePolygon: recovers the editable parameters from a 6-point
 * polygon that was produced by it, so an existing L-shaped item can be
 * re-opened in the visual editor. Returns null for anything else (a plain
 * rect/circle, or a hand-authored polygon).
 */
export function deriveLShapeParams(points: Vec2[]): LShapeParams | null {
  if (points.length !== 6) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const w = Math.max(...xs);
  const d = Math.max(...ys);
  if (Math.min(...xs) > EPS || Math.min(...ys) > EPS) return null;

  const corners: { corner: NotchCorner; x: number; y: number }[] = [
    { corner: "nw", x: 0, y: 0 },
    { corner: "ne", x: w, y: 0 },
    { corner: "sw", x: 0, y: d },
    { corner: "se", x: w, y: d },
  ];
  const missing = corners.filter((c) => !has(points, c.x, c.y));
  if (missing.length !== 1) return null;
  const corner = missing[0].corner;

  // The two notch-defining vertices are the ones strictly interior to both
  // axes (not on the outer bbox in both x and y). Pick them by finding, among
  // the points that sit on one of the two walls touching the missing corner,
  // the one closest to that corner along each axis.
  const onTopOrBottom = (pt: Vec2) => Math.abs(pt.y) < EPS || Math.abs(pt.y - d) < EPS;
  const onLeftOrRight = (pt: Vec2) => Math.abs(pt.x) < EPS || Math.abs(pt.x - w) < EPS;

  let notchWidth = 0;
  let notchDepth = 0;

  if (corner === "ne" || corner === "nw") {
    // point on the top edge (y=0), interior in x
    const p = points.filter((pt) => Math.abs(pt.y) < EPS && !onLeftOrRight(pt));
    notchWidth = p.length > 0 ? Math.min(...p.map((pt) => (corner === "ne" ? w - pt.x : pt.x))) : 0;
  } else {
    // point on the bottom edge (y=d), interior in x
    const p = points.filter((pt) => Math.abs(pt.y - d) < EPS && !onLeftOrRight(pt));
    notchWidth = p.length > 0 ? Math.min(...p.map((pt) => (corner === "se" ? w - pt.x : pt.x))) : 0;
  }

  if (corner === "ne" || corner === "se") {
    // point on the right edge (x=w), interior in y
    const q = points.filter((pt) => Math.abs(pt.x - w) < EPS && !onTopOrBottom(pt));
    notchDepth = q.length > 0 ? Math.min(...q.map((pt) => (corner === "se" ? d - pt.y : pt.y))) : 0;
  } else {
    // point on the left edge (x=0), interior in y
    const q = points.filter((pt) => Math.abs(pt.x) < EPS && !onTopOrBottom(pt));
    notchDepth = q.length > 0 ? Math.min(...q.map((pt) => (corner === "sw" ? d - pt.y : pt.y))) : 0;
  }

  if (notchWidth <= 0 || notchDepth <= 0) return null;
  return { overallW: w, overallD: d, notchCorner: corner, notchWidth, notchDepth };
}
