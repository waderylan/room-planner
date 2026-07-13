import type { Vec2 } from "./types";
import type { Opening } from "../model/types";
import { centroid } from "./polygon";

export interface WallSegment {
  index: number;
  a: Vec2;
  b: Vec2;
  length: number;
  angle: number;
}

/** Every outline edge as a wall, in edge order (edge i runs outline[i] -> outline[i+1]). */
export function wallSegments(outline: Vec2[]): WallSegment[] {
  const n = outline.length;
  return outline.map((a, i) => {
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { index: i, a, b, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
  });
}

/** Unit normal of a wall pointing toward the room interior. */
export function wallInwardNormal(outline: Vec2[], wall: WallSegment): Vec2 {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
  const center = centroid(outline);
  const toCenter = { x: center.x - mid.x, y: center.y - mid.y };
  if (nx * toCenter.x + ny * toCenter.y < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

export interface OpeningSpan {
  wall: WallSegment;
  tangent: Vec2;
  inwardNormal: Vec2;
  start: Vec2;
  end: Vec2;
  mid: Vec2;
}

/** World-space placement of an opening along its wall, or null if the wall no longer exists. */
export function openingSpan(outline: Vec2[], opening: Opening): OpeningSpan | null {
  const walls = wallSegments(outline);
  const wall = walls[opening.wallIndex];
  if (!wall || wall.length < 0.01) return null;
  const ux = (wall.b.x - wall.a.x) / wall.length;
  const uy = (wall.b.y - wall.a.y) / wall.length;
  const start = { x: wall.a.x + ux * opening.offset, y: wall.a.y + uy * opening.offset };
  const end = {
    x: wall.a.x + ux * (opening.offset + opening.width),
    y: wall.a.y + uy * (opening.offset + opening.width),
  };
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return { wall, tangent: { x: ux, y: uy }, inwardNormal: wallInwardNormal(outline, wall), start, end, mid };
}

/** Keeps an opening's placement valid for a (possibly just-changed) outline/ceiling. */
export function clampOpening(outline: Vec2[], ceiling: number, opening: Opening): Opening {
  const walls = wallSegments(outline);
  if (walls.length === 0) return opening;
  const wallIndex = Math.min(Math.max(0, opening.wallIndex), walls.length - 1);
  const wall = walls[wallIndex];
  const maxWidth = Math.max(0.5, wall.length - 0.05);
  const width = Math.min(Math.max(0.5, opening.width), maxWidth);
  const offset = Math.min(Math.max(0, opening.offset), Math.max(0, wall.length - width));
  const sillHeight = opening.kind === "door" ? 0 : Math.max(0, Math.min(opening.sillHeight, Math.max(0, ceiling - 0.2)));
  const height = Math.min(Math.max(0.2, opening.height), Math.max(0.2, ceiling - sillHeight));
  return { ...opening, wallIndex, width, offset, sillHeight, height };
}

export interface WallSolidSegment {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

/**
 * Splits a wall into the rectangular slabs that remain once every opening on
 * it has been cut out, in the wall's local (u = along wall, y = up) space.
 */
export function wallSolidSegments(wall: WallSegment, ceiling: number, openings: Opening[]): WallSolidSegment[] {
  const onWall = openings
    .filter((o) => o.wallIndex === wall.index)
    .map((o) => ({
      u0: Math.max(0, Math.min(wall.length, o.offset)),
      u1: Math.max(0, Math.min(wall.length, o.offset + o.width)),
      y0: o.sillHeight,
      y1: o.sillHeight + o.height,
    }))
    .sort((a, b) => a.u0 - b.u0);

  const breakpoints = new Set<number>([0, wall.length]);
  for (const o of onWall) {
    breakpoints.add(o.u0);
    breakpoints.add(o.u1);
  }
  const us = Array.from(breakpoints).sort((a, b) => a - b);

  const segments: WallSolidSegment[] = [];
  for (let i = 0; i < us.length - 1; i++) {
    const u0 = us[i];
    const u1 = us[i + 1];
    if (u1 - u0 < 1e-4) continue;
    const mid = (u0 + u1) / 2;
    const covering = onWall.find((o) => mid > o.u0 && mid < o.u1);
    if (!covering) {
      segments.push({ u0, u1, y0: 0, y1: ceiling });
      continue;
    }
    if (covering.y0 > 0.01) segments.push({ u0, u1, y0: 0, y1: covering.y0 });
    if (covering.y1 < ceiling - 0.01) segments.push({ u0, u1, y0: covering.y1, y1: ceiling });
  }
  return segments;
}
