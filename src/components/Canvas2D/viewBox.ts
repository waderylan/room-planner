import type { Vec2 } from "../../geometry/types";

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function fitViewBox(outline: Vec2[], padding?: number): ViewBox {
  if (outline.length === 0) {
    const p = padding ?? 2;
    return { x: -p, y: -p, w: 10 + p * 2, h: 10 + p * 2 };
  }
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const rawMinX = Math.min(...xs);
  const rawMinY = Math.min(...ys);
  const rawMaxX = Math.max(...xs);
  const rawMaxY = Math.max(...ys);
  // leave room for the wall/dimension labels that sit just outside the outline;
  // they scale with room size (see RoomOutlineView), so the margin must too
  const p = padding ?? Math.max(2.5, Math.max(rawMaxX - rawMinX, rawMaxY - rawMinY) * 0.16);
  const minX = rawMinX - p;
  const minY = rawMinY - p;
  const maxX = rawMaxX + p;
  const maxY = rawMaxY + p;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function viewBoxString(vb: ViewBox): string {
  return `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
}

export function zoomViewBox(vb: ViewBox, factor: number, center: Vec2, minW = 2, maxW = 200): ViewBox {
  const newW = Math.min(maxW, Math.max(minW, vb.w * factor));
  const newH = (vb.h / vb.w) * newW;
  const fx = (center.x - vb.x) / vb.w;
  const fy = (center.y - vb.y) / vb.h;
  return {
    x: center.x - fx * newW,
    y: center.y - fy * newH,
    w: newW,
    h: newH,
  };
}

export function panViewBox(vb: ViewBox, dx: number, dy: number): ViewBox {
  return { ...vb, x: vb.x + dx, y: vb.y + dy };
}
