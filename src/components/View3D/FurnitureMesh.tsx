import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Item } from "../../model/types";
import { footprintSize, localPolygon, worldCenter } from "../../geometry/shape";
import { centroid } from "../../geometry/polygon";
import { presetIdOf } from "../../model/presets";
import { to3D, rotationYFromDeg } from "./coords";
import { useStore } from "../../store/store";
import { furnitureParts, type FurniturePart } from "./furnitureParts";

interface FurnitureMeshProps {
  item: Item;
  selected: boolean;
}

export function FurnitureMesh({ item, selected }: FurnitureMeshProps) {
  const selectItem = useStore((s) => s.selectItem);
  const presetId = presetIdOf(item);
  const parts = useMemo(() => {
    if (item.footprint.kind !== "rect" && !(presetId === "plant" && item.footprint.kind === "circle")) return [];
    const { w, d } = footprintSize(item.footprint);
    return furnitureParts(presetId, w, d, Math.max(item.height, .001));
  }, [presetId, item.footprint, item.height]);

  const geometry = useMemo(() => {
    if (parts.length && !selected) return null;
    const points = localPolygon(item.footprint);
    // The centroid matches the 2D rotation pivot, including custom concave footprints.
    const center = centroid(points);
    const shape = new THREE.Shape();
    points.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x - center.x, -(p.y - center.y));
      else shape.lineTo(p.x - center.x, -(p.y - center.y));
    });
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(item.height, .001), bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [item.footprint, item.height, parts.length, selected]);
  const edges = useMemo(() => geometry ? new THREE.EdgesGeometry(geometry, 25) : null, [geometry]);
  useEffect(() => () => { geometry?.dispose(); edges?.dispose(); }, [geometry, edges]);
  const center3D = to3D(worldCenter(item), item.elevation);

  return (
    <group position={center3D} rotation={[0, rotationYFromDeg(item.rotDeg), 0]} onClick={(event) => { event.stopPropagation(); selectItem(item.id); }}>
      {parts.length ? parts.map((part, index) => <Part key={index} part={part} color={item.color} />) : geometry && <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={item.color} roughness={.85} /></mesh>}
      {edges && <lineSegments geometry={edges}><lineBasicMaterial color={selected ? "#4f8bfb" : "#4b5563"} transparent opacity={selected ? .85 : .35} depthTest={!selected} /></lineSegments>}
    </group>
  );
}

function Part({ part, color }: { part: FurniturePart; color: string }) {
  const materialColor = useMemo(() => new THREE.Color(color).lerp(new THREE.Color(part.tone >= 0 ? "#ffffff" : "#20242a"), Math.abs(part.tone)), [color, part.tone]);
  return <mesh position={part.center} scale={part.size} castShadow receiveShadow>
    {part.shape === "box" ? <boxGeometry /> : part.shape === "pot" ? <cylinderGeometry args={[.5, .38, 1, 24]} /> : <sphereGeometry args={[.5, 20, 14]} />}
    <meshStandardMaterial color={materialColor} roughness={.83} />
  </mesh>;
}
