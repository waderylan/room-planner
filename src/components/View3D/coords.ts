import * as THREE from "three";
import type { Vec2 } from "../../geometry/types";

/**
 * The single place where the 2D <-> 3D coordinate mapping is defined:
 * 2D x -> 3D x, 2D y -> 3D z, up -> +Y. Every 3D component must go through
 * this (and rotationYFromDeg below) so 2D and 3D never disagree about
 * where something is.
 */
export function to3D(p: Vec2, y = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x, y, p.y);
}

/** Converts our 2D rotDeg (see geometry/shape.ts rotatePoint) to a Three.js Y-axis rotation. */
export function rotationYFromDeg(rotDeg: number): number {
  return -(rotDeg * Math.PI) / 180;
}

/** Converts a 2D angle (radians, atan2(dy,dx) convention) to a Three.js Y-axis rotation. */
export function rotationYFromAngle(angleRad: number): number {
  return -angleRad;
}
