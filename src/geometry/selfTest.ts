import { polygonsIntersect, segSegDistance } from "./polygon";
import type { Vec2 } from "./types";

/**
 * Lightweight runtime sanity checks for the geometry primitives, run once in dev.
 * Not a full test suite, but catches regressions in the tricky cases called out
 * in the spec: overlapping, touching, disjoint, one-inside-other, L-shape.
 */
export function runGeometrySelfTest(): void {
  const results: [string, boolean][] = [];
  const check = (name: string, cond: boolean) => results.push([name, cond]);

  const sq = (x0: number, y0: number, s: number): Vec2[] => [
    { x: x0, y: y0 },
    { x: x0 + s, y: y0 },
    { x: x0 + s, y: y0 + s },
    { x: x0, y: y0 + s },
  ];

  // disjoint squares
  check("disjoint squares don't intersect", !polygonsIntersect(sq(0, 0, 2), sq(5, 5, 2)));
  check("disjoint squares distance > 0", segSegDistance({ x: 2, y: 0 }, { x: 2, y: 2 }, { x: 5, y: 0 }, { x: 5, y: 2 }) === 3);

  // overlapping squares
  check("overlapping squares intersect", polygonsIntersect(sq(0, 0, 2), sq(1, 1, 2)));

  // touching squares (share an edge)
  check("touching squares intersect (edge-shared)", polygonsIntersect(sq(0, 0, 2), sq(2, 0, 2)));
  check("touching segments distance is 0", segSegDistance({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }) === 0);

  // one inside the other
  check("small square inside big square intersects", polygonsIntersect(sq(0, 0, 10), sq(2, 2, 1)));

  // L-shape (concave) vs a square sitting in its notch (should not intersect)
  const lshape: Vec2[] = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 3 },
    { x: 3, y: 3 },
    { x: 3, y: 6 },
    { x: 0, y: 6 },
  ];
  check("square in L-shape's notch does not intersect", !polygonsIntersect(lshape, sq(4, 4, 1)));
  check("square overlapping L-shape's solid arm intersects", polygonsIntersect(lshape, sq(1, 1, 1)));

  const failed = results.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      "[geometry self-test] FAILED:",
      failed.map(([name]) => name),
    );
  } else {
    // eslint-disable-next-line no-console
    console.info(`[geometry self-test] all ${results.length} checks passed`);
  }
}
