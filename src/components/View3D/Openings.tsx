import { useMemo } from "react";
import * as THREE from "three";
import type { Vec2 } from "../../geometry/types";
import type { Opening } from "../../model/types";
import { openingSpan, type OpeningSpan } from "../../geometry/openings";
import { to3D, rotationYFromAngle } from "./coords";

const THICKNESS = 0.15;

interface OpeningsViewProps {
  outline: Vec2[];
  openings: Opening[];
}

export function OpeningsView({ outline, openings }: OpeningsViewProps) {
  return (
    <group>
      {openings.map((o) => {
        const span = openingSpan(outline, o);
        if (!span) return null;
        return o.kind === "window" ? (
          <WindowMesh key={o.id} opening={o} span={span} />
        ) : (
          <DoorMesh key={o.id} opening={o} span={span} />
        );
      })}
    </group>
  );
}

function WindowMesh({ opening, span }: { opening: Opening; span: OpeningSpan }) {
  const y = opening.sillHeight + opening.height / 2;
  return (
    <group position={to3D(span.mid, y)} rotation={[0, rotationYFromAngle(span.wall.angle), 0]}>
      <mesh>
        <boxGeometry args={[opening.width, opening.height, THICKNESS * 0.4]} />
        <meshStandardMaterial color="#bcd7ea" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <boxGeometry args={[opening.width, 0.045, THICKNESS * 0.5]} />
        <meshStandardMaterial color="#8a97a3" />
      </mesh>
      <mesh>
        <boxGeometry args={[0.045, opening.height, THICKNESS * 0.5]} />
        <meshStandardMaterial color="#8a97a3" />
      </mesh>
    </group>
  );
}

function DoorMesh({ opening, span }: { opening: Opening; span: OpeningSpan }) {
  const hinge = opening.hinge === "left" ? span.start : span.end;
  const closedDir: Vec2 =
    opening.hinge === "left" ? span.tangent : { x: -span.tangent.x, y: -span.tangent.y };
  const openDir = span.inwardNormal;

  const closedAngle = Math.atan2(closedDir.y, closedDir.x);
  const openAngle = Math.atan2(openDir.y, openDir.x);
  const delta = ((openAngle - closedAngle + Math.PI) % (2 * Math.PI)) - Math.PI;

  const leafMid: Vec2 = { x: hinge.x + openDir.x * (opening.width / 2), y: hinge.y + openDir.y * (opening.width / 2) };
  const leafY = opening.sillHeight + opening.height / 2;

  const arcLine = useMemo(() => {
    const steps = 24;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = closedAngle + (delta * i) / steps;
      const p: Vec2 = { x: hinge.x + Math.cos(t) * opening.width, y: hinge.y + Math.sin(t) * opening.width };
      pts.push(to3D(p, 0.015));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#8a97a3" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hinge.x, hinge.y, closedAngle, delta, opening.width]);

  return (
    <group>
      <mesh position={to3D(leafMid, leafY)} rotation={[0, rotationYFromAngle(openAngle), 0]} castShadow>
        <boxGeometry args={[opening.width * 0.96, opening.height, 0.045]} />
        <meshStandardMaterial color="#9c7b53" />
      </mesh>
      <primitive object={arcLine} />
    </group>
  );
}
