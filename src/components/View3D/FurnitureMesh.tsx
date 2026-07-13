import { useMemo } from "react";
import * as THREE from "three";
import type { Item } from "../../model/types";
import { localPolygon, worldCenter } from "../../geometry/shape";
import { centroid } from "../../geometry/polygon";
import { to3D, rotationYFromDeg } from "./coords";

interface FurnitureMeshProps {
  item: Item;
  selected: boolean;
}

export function FurnitureMesh({ item, selected }: FurnitureMeshProps) {
  const geometry = useMemo(() => {
    const points = localPolygon(item.footprint);
    // Shift the shape so its centroid sits at the local origin, matching the
    // 2D canvas which rotates each item about its footprint centroid (see
    // geometry/shape.ts worldPolygon). Rotating a differently-pivoted mesh
    // here would make rotated pieces land in the wrong spot (even outside
    // the room) compared to the 2D view.
    const center = centroid(points);
    const shape = new THREE.Shape();
    points.forEach((p, i) => {
      const x = p.x - center.x;
      const y = -(p.y - center.y);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(item.height, 0.02), bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [item.footprint, item.height]);

  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 25), [geometry]);

  const center3D = to3D(worldCenter(item), item.elevation);

  return (
    <group position={center3D} rotation={[0, rotationYFromDeg(item.rotDeg), 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={item.color} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={selected ? "#2563eb" : "#00000055"} linewidth={1} />
      </lineSegments>
    </group>
  );
}
