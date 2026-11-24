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
  const selectItem = useStore((s) => s.selectItem);
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
    { x: bounds.center.x + bounds.span * 1.05, y: bounds.center.y + bounds.span * 1.35 },
    bounds.span * 1.15 + room.ceiling * .3,
  );

  return (
    <div className="relative h-full w-full bg-[var(--bg-inset)]">
      <Canvas shadows="percentage" dpr={[1, 2]} aria-label="3D room view" frameloop={cameraMode === "walk" ? "always" : "demand"} onPointerMissed={() => selectItem(null)} fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">3D view unavailable</div>}>
        <color attach="background" args={[bgColor]} />
        {cameraMode === "orbit" && (
          <PerspectiveCamera
            makeDefault
            position={[cameraStart.x, cameraStart.y, cameraStart.z]}
            fov={45}
            near={0.05}
            far={500}
          />
        )}
        <ambientLight intensity={.85} />
        <directionalLight
          position={[bounds.center.x + bounds.span * .7, bounds.span * 1.6, bounds.center.y + bounds.span]}
          intensity={1.1}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-bounds.span}
          shadow-camera-right={bounds.span}
          shadow-camera-top={bounds.span}
          shadow-camera-bottom={-bounds.span}
          shadow-camera-far={bounds.span * 5}
          shadow-bias={-.001}
          shadow-radius={3}
        />

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
          <OrbitControls target={[orbitTarget.x, orbitTarget.y, orbitTarget.z]} minDistance={bounds.span * .15} maxDistance={bounds.span * 6} maxPolarAngle={Math.PI / 2 - .03} makeDefault />
        ) : (
          <WalkControls outline={room.outline} items={room.items} eyeHeight={room.unit === "m" ? 1.8288 : 6} ceiling={room.ceiling} unitScale={room.unit === "m" ? .3048 : 1} />
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
