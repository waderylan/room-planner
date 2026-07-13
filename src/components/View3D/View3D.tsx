import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useStore } from "../../store/store";
import { Floor } from "./Floor";
import { Walls } from "./Walls";
import { OpeningsView } from "./Openings";
import { FurnitureMesh } from "./FurnitureMesh";
import { WalkControls } from "./WalkControls";
import { to3D } from "./coords";

export function View3D() {
  const room = useStore((s) => s.activeRoom());
  const cameraMode = useStore((s) => s.cameraMode);
  const wallsVisible = useStore((s) => s.wallsVisible);
  const theme = useStore((s) => s.theme);
  const bgColor = theme === "dark" ? "#1c1c20" : "#eceef1";

  const bounds = useMemo(() => {
    const xs = room.outline.map((p) => p.x);
    const ys = room.outline.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return { center: { x: cx, y: cy }, span };
  }, [room.outline]);

  const orbitTarget = to3D(bounds.center, room.ceiling / 3);
  const cameraStart = to3D(
    { x: bounds.center.x + bounds.span * 1.1, y: bounds.center.y + bounds.span * 1.5 },
    bounds.span * 1.3 + room.ceiling,
  );

  return (
    <div className="relative h-full w-full bg-[var(--bg-inset)]">
      <Canvas shadows>
        <color attach="background" args={[bgColor]} />
        {cameraMode === "orbit" && (
          <PerspectiveCamera
            makeDefault
            position={[cameraStart.x, cameraStart.y, cameraStart.z]}
            fov={55}
            near={0.05}
            far={500}
          />
        )}
        <ambientLight intensity={0.65} />
        <directionalLight position={[bounds.center.x + 8, 14, bounds.center.y + 6]} intensity={0.9} castShadow />

        <Floor outline={room.outline} />
        {wallsVisible && (
          <>
            <Walls outline={room.outline} ceiling={room.ceiling} openings={room.openings} />
            <OpeningsView outline={room.outline} openings={room.openings} />
          </>
        )}

        {room.items
          .filter((it) => !it.hidden)
          .map((item) => (
            <FurnitureMesh key={item.id} item={item} selected={item.id === room.selectedItemId} />
          ))}

        {cameraMode === "orbit" ? (
          <OrbitControls target={[orbitTarget.x, orbitTarget.y, orbitTarget.z]} makeDefault />
        ) : (
          <WalkControls outline={room.outline} items={room.items} eyeHeight={6} ceiling={room.ceiling} />
        )}
      </Canvas>

      {cameraMode === "walk" && <WalkLegend />}
    </div>
  );
}

const WALK_KEYS: [string, string][] = [
  ["Click canvas", "Lock the mouse to look around"],
  ["W A S D", "Move"],
  ["H", "Raise the camera"],
  ["L", "Lower the camera"],
  ["Esc", "Release the mouse"],
];

function WalkLegend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {WALK_KEYS.map(([key, desc]) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="rounded border border-[var(--border)] bg-[var(--bg-inset)] px-1.5 py-0.5 font-mono text-[var(--text)]">
              {key}
            </span>
            <span>{desc}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
