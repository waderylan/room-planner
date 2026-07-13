import { useMemo } from "react";
import * as THREE from "three";
import type { Vec2 } from "../../geometry/types";
import type { Opening } from "../../model/types";
import { wallSegments, wallSolidSegments } from "../../geometry/openings";
import { to3D, rotationYFromAngle } from "./coords";

interface WallsProps {
  outline: Vec2[];
  ceiling: number;
  openings: Opening[];
}

const THICKNESS = 0.15;

export function Walls({ outline, ceiling, openings }: WallsProps) {
  const boxes = useMemo(() => {
    const walls = wallSegments(outline);
    const out: { key: string; length: number; height: number; mid: Vec2; y: number; angle: number }[] = [];
    for (const wall of walls) {
      if (wall.length < 0.01) continue;
      const ux = (wall.b.x - wall.a.x) / wall.length;
      const uy = (wall.b.y - wall.a.y) / wall.length;
      const segments = wallSolidSegments(wall, ceiling, openings);
      segments.forEach((seg, i) => {
        const uMid = (seg.u0 + seg.u1) / 2;
        const mid: Vec2 = { x: wall.a.x + ux * uMid, y: wall.a.y + uy * uMid };
        out.push({
          key: `${wall.index}-${i}`,
          length: seg.u1 - seg.u0,
          height: seg.y1 - seg.y0,
          mid,
          y: (seg.y0 + seg.y1) / 2,
          angle: wall.angle,
        });
      });
    }
    return out;
  }, [outline, ceiling, openings]);

  return (
    <group>
      {boxes.map((seg) => (
        <mesh key={seg.key} position={to3D(seg.mid, seg.y)} rotation={[0, rotationYFromAngle(seg.angle), 0]}>
          <boxGeometry args={[seg.length, seg.height, THICKNESS]} />
          <meshStandardMaterial color="#e7e8ea" side={THREE.DoubleSide} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
