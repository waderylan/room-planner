import { useMemo } from "react";
import * as THREE from "three";
import type { Vec2 } from "../../geometry/types";

interface FloorProps {
  outline: Vec2[];
}

export function Floor({ outline }: FloorProps) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    outline.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x, -p.y);
      else shape.lineTo(p.x, -p.y);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [outline]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color="#c9cdd3" side={THREE.DoubleSide} />
    </mesh>
  );
}
