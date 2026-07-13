import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import type { Vec2 } from "../../geometry/types";
import type { Item } from "../../model/types";
import { clampPointInsideOutline, pointInsideOutline, worldPolygon } from "../../geometry/shape";
import { centroid, pointInPolygon } from "../../geometry/polygon";

interface WalkControlsProps {
  outline: Vec2[];
  items: Item[];
  eyeHeight: number;
  ceiling: number;
}

const SPEED = 4.5;
const VERTICAL_SPEED = 3;
const MIN_HEIGHT = 0.3;
const SPAWN_STEP = 0.5;

/** A point inside the outline that doesn't sit on top of any furniture footprint. */
function findClearSpawnPoint(outline: Vec2[], items: Item[]): Vec2 {
  const furniturePolys = items.filter((it) => !it.hidden).map((it) => worldPolygon(it));
  const isClear = (p: Vec2) => pointInPolygon(p, outline) && !furniturePolys.some((poly) => pointInPolygon(p, poly));

  const center = centroid(outline);
  if (isClear(center)) return center;

  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  for (let y = minY; y <= maxY; y += SPAWN_STEP) {
    for (let x = minX; x <= maxX; x += SPAWN_STEP) {
      const p = { x, y };
      if (isClear(p)) return p;
    }
  }
  return center;
}

export function WalkControls({ outline, items, eyeHeight, ceiling }: WalkControlsProps) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const heightRef = useRef(eyeHeight);

  useEffect(() => {
    const here: Vec2 = { x: camera.position.x, y: camera.position.z };
    const currentlyClear =
      pointInsideOutline(here, outline) &&
      !items.filter((it) => !it.hidden).some((it) => pointInPolygon(here, worldPolygon(it)));
    const start = currentlyClear ? here : findClearSpawnPoint(outline, items);
    const startHeight = Math.min(eyeHeight, Math.max(MIN_HEIGHT, ceiling - 0.2));
    heightRef.current = startHeight;
    camera.position.set(start.x, startHeight, start.y);
    function onDown(e: KeyboardEvent) {
      keys.current[e.code] = true;
    }
    function onUp(e: KeyboardEvent) {
      keys.current[e.code] = false;
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      keys.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    const k = keys.current;

    // H = raise the camera, L = lower it, clamped to stay inside the room vertically.
    const moveUp = (k["KeyH"] ? 1 : 0) - (k["KeyL"] ? 1 : 0);
    if (moveUp !== 0) {
      const maxHeight = Math.max(MIN_HEIGHT, ceiling - 0.2);
      heightRef.current = Math.min(maxHeight, Math.max(MIN_HEIGHT, heightRef.current + moveUp * VERTICAL_SPEED * delta));
    }
    camera.position.y = heightRef.current;

    const moveForward = (k["KeyW"] ? 1 : 0) - (k["KeyS"] ? 1 : 0);
    const moveRight = (k["KeyD"] ? 1 : 0) - (k["KeyA"] ? 1 : 0);
    if (moveForward === 0 && moveRight === 0) return;

    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    // forward x up already points to the camera's right; do not negate it,
    // or A/D end up strafing backwards relative to where you're looking.
    right.current.crossVectors(forward.current, new THREE.Vector3(0, 1, 0)).normalize();

    const step = SPEED * delta;
    const next = camera.position.clone();
    next.addScaledVector(forward.current, moveForward * step);
    next.addScaledVector(right.current, moveRight * step);

    const clamped2D = clampPointInsideOutline({ x: next.x, y: next.z }, outline);
    camera.position.x = clamped2D.x;
    camera.position.z = clamped2D.y;
  });

  return <PointerLockControls />;
}
