/**
 * Pure scroll-choreography math for the landing page. Everything here maps a
 * scroll progress p in [0, 1] (plus cursor + time inputs) to poses; no three.js,
 * no React. The signature move is `qsteps`: animation values snap through a
 * small number of hard steps instead of tweening smoothly, which is what makes
 * the motion read as early-2000s console rendering rather than a modern ease.
 */

export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Normalized position of p inside [a, b], clamped. */
export const seg = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a));

/** Quantized 0..1 ramp with n hard steps (reaches exactly 1 at t = 1). */
export const qsteps = (t: number, n: number): number =>
  Math.min(n, Math.floor(clamp01(t) * (n + 1))) / n;

export const smooth = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** Scroll phases. Values are fractions of total scroll distance. */
export const PHASE = {
  floorA: 0.03,
  floorB: 0.115,
  wallsA: 0.115,
  wallsB: 0.2,
  buildA: 0.22,
  buildB: 0.66,
  walkA: 0.7,
  walkB: 0.85,
  finale: 0.86,
} as const;

export interface DropState {
  visible: boolean;
  y: number;
  sy: number;
  sxz: number;
}

/**
 * A piece falling from `height` to the floor over local time t in [0, 1]:
 * a quantized gravity fall for the first ~80%, then a two-beat
 * squash-and-settle on landing.
 */
export function dropIn(t: number, height: number): DropState {
  if (t <= 0) return { visible: false, y: height, sy: 1, sxz: 1 };
  if (t >= 1) return { visible: true, y: 0, sy: 1, sxz: 1 };
  const u = clamp01(t / 0.82);
  const q = qsteps(u, 8);
  const y = (1 - q * q) * height;
  let sy = 1;
  let sxz = 1;
  if (t > 0.82) {
    if (t < 0.9) {
      sy = 0.72;
      sxz = 1.14;
    } else if (t < 0.96) {
      sy = 1.07;
      sxz = 0.95;
    }
  }
  return { visible: true, y, sy, sxz };
}

/** Walls rise out of the floor in hard steps. */
export function wallRise(p: number): { visible: boolean; sy: number } {
  const t = seg(p, PHASE.wallsA, PHASE.wallsB);
  return { visible: t > 0, sy: Math.max(0.001, qsteps(t, 7)) };
}

/** Local drop time for furniture piece i of n, staggered across the build phase. */
export function pieceT(p: number, i: number, n: number): number {
  const span = PHASE.buildB - PHASE.buildA;
  const start = PHASE.buildA + (i / n) * span * 0.88;
  const dur = (span / n) * 1.8;
  return seg(p, start, start + dur);
}

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  ty: number;
  fov: number;
}

/**
 * Camera orbit around the room center. Scroll sweeps the yaw ~195 degrees,
 * the cursor adds a springy hover swing, `spin` is a time accumulator for the
 * idle/finale free spin, and the walk phase dips the camera down to eye
 * height inside the room with a wider lens.
 */
export function cameraPose(p: number, mx: number, my: number, spin: number): CameraPose {
  const yaw = 1.45 - p * 3.4 - mx * 0.676 + spin;
  const walk =
    smooth(seg(p, PHASE.walkA, PHASE.walkA + 0.045)) *
    (1 - smooth(seg(p, PHASE.walkB - 0.045, PHASE.walkB)));
  const r = lerp(27, 7.5, walk);
  const h = lerp(13.5 + my * 5.915, 4.6, walk);
  return {
    x: Math.cos(yaw) * r,
    y: h,
    z: Math.sin(yaw) * r,
    ty: lerp(2.5, 4.4, walk),
    fov: lerp(38, 62, walk),
  };
}

/** Idle spin speed: lazy rotation at the hero and finale, near-still mid-build. */
export function spinSpeed(p: number): number {
  return p < 0.05 || p > PHASE.finale ? 0.22 : 0.02;
}
