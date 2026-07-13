import type { Vec2 } from "../../geometry/types";

/** Converts a client (screen) point to the SVG user-space coordinates of `svg`, honoring the current viewBox/CTM. */
export function screenToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Vec2 {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}
