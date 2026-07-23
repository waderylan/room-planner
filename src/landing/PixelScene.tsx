import { useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  VOID,
  FLOOR_GREEN,
  WALL_WHITE,
  TRIM_YELLOW,
  BRICK_RED,
  BRICK_BLUE,
  BRICK_YELLOW,
  BRICK_ORANGE,
  BRICK_GREEN,
  BRICK_WHITE,
  BRICK_DARK,
  SCREEN_BLUE,
  CUBE_COLORS,
} from "./palette";
import { PHASE, cameraPose, dropIn, pieceT, seg, spinSpeed, wallRise } from "./timeline";

/**
 * The PS2 trick: render internally at ~230 vertical pixels and let CSS
 * upscale with nearest-neighbor (image-rendering: pixelated on the canvas).
 * Pixelation this way is nearly free, so the scene runs fast everywhere.
 */
const PIXEL_DPR = Math.max(0.12, Math.min(0.5, 230 / window.innerHeight));

/** 3-band toon ramp shared by every material: flat vertex-lit console shading. */
const ramp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitBoxEdges = new THREE.EdgesGeometry(unitBox);
const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const unitCylEdges = new THREE.EdgesGeometry(unitCyl, 30);
const unitCone = new THREE.ConeGeometry(0.5, 1, 10);

interface BrickProps {
  w: number;
  h: number;
  d: number;
  x?: number;
  /** bottom of the box above the local floor (y of the underside) */
  b?: number;
  z?: number;
  color: string;
  cyl?: boolean;
  edges?: boolean;
}

/** One toon-shaded box (or low-poly cylinder) with dark edge lines. */
function Brick({ w, h, d, x = 0, b = 0, z = 0, color, cyl = false, edges = true }: BrickProps) {
  return (
    <group position={[x, b + h / 2, z]} scale={[w, h, d]}>
      <mesh geometry={cyl ? unitCyl : unitBox}>
        <meshToonMaterial color={color} gradientMap={ramp} />
      </mesh>
      {edges && (
        <lineSegments geometry={cyl ? unitCylEdges : unitBoxEdges}>
          <lineBasicMaterial color="#151310" transparent opacity={0.45} />
        </lineSegments>
      )}
    </group>
  );
}

/** Room footprint: 16 x 12 ft, origin at the NW floor corner, +x east, +z south. */
const ROOM_W = 16;
const ROOM_D = 12;

/** Green baseplate floor slab. */
function Floor() {
  return <Brick w={ROOM_W} h={0.7} d={ROOM_D} x={ROOM_W / 2} b={-0.7} z={ROOM_D / 2} color={FLOOR_GREEN} />;
}

/**
 * North and west walls only, dollhouse style. Window in the north wall
 * (x 3.5..6.5, sill 3, head 6.5), open doorway in the west wall (z 4.6..7.6),
 * both trimmed in yellow.
 */
function Walls() {
  return (
    <>
      {/* north wall */}
      <Brick w={3.5} h={8} d={0.5} x={1.75} z={0.25} color={WALL_WHITE} />
      <Brick w={9.5} h={8} d={0.5} x={11.25} z={0.25} color={WALL_WHITE} />
      <Brick w={3} h={3} d={0.5} x={5} z={0.25} color={WALL_WHITE} />
      <Brick w={3} h={1.5} d={0.5} x={5} b={6.5} z={0.25} color={WALL_WHITE} />
      <Brick w={3.4} h={0.2} d={0.62} x={5} b={2.92} z={0.25} color={TRIM_YELLOW} />
      <Brick w={3.4} h={0.2} d={0.62} x={5} b={6.48} z={0.25} color={TRIM_YELLOW} />
      <Brick w={0.2} h={3.76} d={0.62} x={3.4} b={2.92} z={0.25} color={TRIM_YELLOW} />
      <Brick w={0.2} h={3.76} d={0.62} x={6.6} b={2.92} z={0.25} color={TRIM_YELLOW} />
      {/* west wall */}
      <Brick w={0.5} h={7.96} d={4.6} x={0.25} z={2.3} color={WALL_WHITE} />
      <Brick w={0.5} h={7.96} d={4.4} x={0.25} z={9.8} color={WALL_WHITE} />
      <Brick w={0.5} h={1.16} d={3} x={0.25} b={6.8} z={6.1} color={WALL_WHITE} />
      <Brick w={0.62} h={7} d={0.2} x={0.25} z={4.5} color={TRIM_YELLOW} />
      <Brick w={0.62} h={7} d={0.2} x={0.25} z={7.7} color={TRIM_YELLOW} />
      <Brick w={0.62} h={0.2} d={3.4} x={0.25} b={6.78} z={6.1} color={TRIM_YELLOW} />
      <NameSign />
    </>
  );
}

/** Canvas-drawn text, upscaled pixelated same as the rest of the render — no font loading needed. */
function useSignTexture(text: string): THREE.CanvasTexture {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 922;
    canvas.height = 173;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000000";
      ctx.font = "700 112px 'Courier New', monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(text, canvas.width - 18, canvas.height / 2 + 4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [text]);
}

/** Name plaque on the wall opposite the camera, right-aligned near the corner. */
function NameSign() {
  const texture = useSignTexture("RYLAN WADE");
  return (
    <mesh position={[10.72, 6, 0.51]}>
      <planeGeometry args={[9.36, 1.8]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}

function Bed() {
  return (
    <>
      <Brick w={5} h={2.6} d={0.35} z={-3.17} color={BRICK_RED} />
      <Brick w={5} h={1.1} d={6.7} color={BRICK_RED} />
      <Brick w={4.5} h={0.6} d={5.2} b={1.1} z={0.55} color={BRICK_WHITE} />
      <Brick w={2.9} h={0.4} d={1.3} b={1.1} z={-2.4} color={BRICK_WHITE} />
    </>
  );
}

function Sofa() {
  return (
    <>
      <Brick w={6} h={1.1} d={2.2} z={0.3} color={BRICK_BLUE} />
      <Brick w={6} h={2.6} d={0.8} z={-1.05} color={BRICK_BLUE} />
      <Brick w={0.6} h={1.8} d={3} x={-2.7} color={BRICK_BLUE} />
      <Brick w={0.6} h={1.8} d={3} x={2.7} color={BRICK_BLUE} />
    </>
  );
}

function Wardrobe() {
  return (
    <>
      <Brick w={4} h={6.5} d={2} color={BRICK_YELLOW} />
      <Brick w={3.6} h={5.6} d={0.14} b={0.5} z={1.02} color={BRICK_WHITE} />
    </>
  );
}

function Desk() {
  return (
    <>
      <Brick w={4.5} h={0.3} d={2.3} b={2.2} color={BRICK_ORANGE} />
      <Brick w={0.4} h={2.2} d={2.1} x={-2} color={BRICK_ORANGE} />
      <Brick w={0.4} h={2.2} d={2.1} x={2} color={BRICK_ORANGE} />
    </>
  );
}

function Chair() {
  return (
    <>
      <Brick w={1.1} h={1.4} d={1.1} color={BRICK_BLUE} />
      <Brick w={1.4} h={0.3} d={1.4} b={1.4} color={BRICK_BLUE} />
      <Brick w={1.4} h={1.6} d={0.25} b={1.5} z={-0.6} color={BRICK_BLUE} />
    </>
  );
}

function CoffeeTable() {
  return (
    <>
      <Brick w={4} h={0.35} d={2} b={1.05} color={BRICK_WHITE} />
      <Brick w={3.3} h={1.05} d={1.4} color={BRICK_WHITE} />
    </>
  );
}

function TvStand() {
  return (
    <>
      <Brick w={5} h={1.8} d={1.3} color={BRICK_DARK} />
      <Brick w={3.9} h={2.3} d={0.28} b={1.8} color="#26241f" />
      <group position={[0, 2.9, 0.18]} scale={[3.3, 1.7, 0.06]}>
        <mesh geometry={unitBox}>
          <meshBasicMaterial color={SCREEN_BLUE} />
        </mesh>
      </group>
    </>
  );
}

function Rug() {
  return <Brick w={8} h={0.25} d={5} color={BRICK_WHITE} />;
}

function Lamp() {
  return (
    <>
      <Brick w={1} h={0.15} d={1} cyl color={BRICK_WHITE} />
      <Brick w={0.18} h={3.1} d={0.18} cyl color={BRICK_WHITE} edges={false} />
      <group position={[0, 3.35, 0]} scale={[1.7, 1.2, 1.7]}>
        <mesh geometry={unitCone}>
          <meshToonMaterial color={BRICK_YELLOW} gradientMap={ramp} />
        </mesh>
      </group>
    </>
  );
}

function Plant() {
  return (
    <>
      <Brick w={1.3} h={1} d={1.3} cyl color={BRICK_RED} />
      <Brick w={2} h={1.1} d={2} b={1} cyl color={BRICK_GREEN} />
      <Brick w={1.4} h={0.9} d={1.4} b={2.1} cyl color={BRICK_GREEN} />
      <group position={[0, 3.4, 0]} scale={[1, 0.9, 1]}>
        <mesh geometry={unitCone}>
          <meshToonMaterial color={BRICK_GREEN} gradientMap={ramp} />
        </mesh>
      </group>
    </>
  );
}

function Nightstand() {
  return (
    <>
      <Brick w={1.5} h={2} d={1.5} color={BRICK_ORANGE} />
      <Brick w={1.3} h={0.5} d={0.1} b={0.7} z={0.72} color={BRICK_DARK} />
      <Brick w={0.9} h={0.15} d={0.9} b={2} color={BRICK_YELLOW} cyl />
    </>
  );
}

function SideTable() {
  return (
    <>
      <Brick w={1.4} h={0.15} d={1.4} b={1.65} cyl color={BRICK_YELLOW} />
      <Brick w={0.18} h={1.65} d={0.18} cyl color={BRICK_DARK} edges={false} />
    </>
  );
}

function Stool() {
  return (
    <>
      <Brick w={1.2} h={0.2} d={1.2} b={1.5} cyl color={BRICK_RED} />
      <Brick w={0.15} h={1.5} d={0.15} x={-0.42} z={-0.42} cyl color={BRICK_DARK} edges={false} />
      <Brick w={0.15} h={1.5} d={0.15} x={0.42} z={-0.42} cyl color={BRICK_DARK} edges={false} />
      <Brick w={0.15} h={1.5} d={0.15} x={-0.42} z={0.42} cyl color={BRICK_DARK} edges={false} />
      <Brick w={0.15} h={1.5} d={0.15} x={0.42} z={0.42} cyl color={BRICK_DARK} edges={false} />
    </>
  );
}

function Mirror() {
  return (
    <>
      <Brick w={1.6} h={4} d={0.15} color={BRICK_BLUE} />
      <group position={[0, 2.2, 0.09]} scale={[1.2, 3, 0.06]}>
        <mesh geometry={unitBox}>
          <meshBasicMaterial color="#bcd6ea" />
        </mesh>
      </group>
    </>
  );
}

interface PieceDef {
  key: string;
  x: number;
  z: number;
  rotY?: number;
  el: ReactNode;
}

/** Drop order is array order: big anchors first, garnish last. */
const PIECES: PieceDef[] = [
  { key: "rug", x: 11.2, z: 8, el: <Rug /> },
  { key: "bed", x: 3, z: 3.9, el: <Bed /> },
  { key: "wardrobe", x: 1.6, z: 9.3, rotY: Math.PI / 2, el: <Wardrobe /> },
  { key: "sofa", x: 11.2, z: 10.5, rotY: Math.PI, el: <Sofa /> },
  { key: "coffee", x: 11.2, z: 7.3, el: <CoffeeTable /> },
  { key: "tv", x: 11.2, z: 1.2, el: <TvStand /> },
  { key: "desk", x: 14.3, z: 4, rotY: Math.PI / 2, el: <Desk /> },
  { key: "chair", x: 12.9, z: 4, rotY: Math.PI / 2, el: <Chair /> },
  { key: "lamp", x: 14.6, z: 9.8, el: <Lamp /> },
  { key: "plant", x: 6.3, z: 10.6, el: <Plant /> },
  { key: "nightstand", x: 6.2, z: 1.5, el: <Nightstand /> },
  { key: "sidetable", x: 8.0, z: 11.0, el: <SideTable /> },
  { key: "stool", x: 9.4, z: 2.6, el: <Stool /> },
  { key: "mirror", x: 3.6, z: 11.75, el: <Mirror /> },
];

type VoidShape = "box" | "cyl" | "cone";

interface CubeDef {
  pos: [number, number, number];
  size: number;
  color: string;
  spin: number;
  phase: number;
  shape: VoidShape;
}

const VOID_SHAPES: VoidShape[] = ["box", "box", "box", "cyl", "cyl", "cone"];

function voidGeometry(shape: VoidShape) {
  if (shape === "cyl") return unitCyl;
  if (shape === "cone") return unitCone;
  return unitBox;
}

function voidEdges(shape: VoidShape) {
  if (shape === "cyl") return unitCylEdges;
  if (shape === "cone") return undefined;
  return unitBoxEdges;
}

/** Save-data shapes drifting in the void, the way a memory card screen would. */
function VoidCubes() {
  const group = useRef<THREE.Group>(null);
  const cubes = useMemo<CubeDef[]>(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        let x = 0;
        let z = 0;
        while (Math.hypot(x, z) < 20) {
          x = (Math.random() * 2 - 1) * 55;
          z = (Math.random() * 2 - 1) * 55;
        }
        return {
          pos: [x, Math.random() * 46 - 16, z],
          size: 0.7 + Math.random() * 2.1,
          color: CUBE_COLORS[i % CUBE_COLORS.length],
          spin: 0.12 + Math.random() * 0.32,
          phase: Math.random() * Math.PI * 2,
          shape: VOID_SHAPES[i % VOID_SHAPES.length],
        };
      }),
    [],
  );
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((c, i) => {
      const def = cubes[i];
      c.rotation.y = t * def.spin;
      c.rotation.x = t * def.spin * 0.6;
      c.position.y = def.pos[1] + Math.sin(t * 0.5 + def.phase) * 1.4;
    });
  });
  return (
    <group ref={group}>
      {cubes.map((c, i) => {
        const edges = voidEdges(c.shape);
        return (
          <group key={i} position={c.pos} scale={c.size}>
            <mesh geometry={voidGeometry(c.shape)}>
              <meshToonMaterial color={c.color} gradientMap={ramp} />
            </mesh>
            {edges && (
              <lineSegments geometry={edges}>
                <lineBasicMaterial color="#151310" transparent opacity={0.4} />
              </lineSegments>
            )}
          </group>
        );
      })}
    </group>
  );
}

interface RigProps {
  progressTarget: { current: number };
  mouse: { current: { x: number; y: number } };
  reduced: boolean;
}

function Rig({ progressTarget, mouse, reduced }: RigProps) {
  const sp = useRef(0);
  const spin = useRef(0);
  const sm = useRef({ x: 0, y: 0 });
  const floorRef = useRef<THREE.Group>(null);
  const wallsRef = useRef<THREE.Group>(null);
  const pieceRefs = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const target = progressTarget.current;
    sp.current += (target - sp.current) * (1 - Math.exp(-dt * 5.5));
    const p = sp.current;
    if (!reduced) {
      sm.current.x += (mouse.current.x - sm.current.x) * (1 - Math.exp(-dt * 4));
      sm.current.y += (mouse.current.y - sm.current.y) * (1 - Math.exp(-dt * 4));
      spin.current += dt * spinSpeed(p);
    }

    const floor = floorRef.current;
    if (floor) {
      const f = dropIn(seg(p, PHASE.floorA, PHASE.floorB), 26);
      floor.visible = f.visible;
      floor.position.y = f.y;
      floor.scale.set(1, f.sy, 1);
    }
    const walls = wallsRef.current;
    if (walls) {
      const w = wallRise(p);
      walls.visible = w.visible;
      walls.scale.set(1, w.sy, 1);
    }
    PIECES.forEach((_, i) => {
      const g = pieceRefs.current[i];
      if (!g) return;
      const st = dropIn(pieceT(p, i, PIECES.length), 16);
      g.visible = st.visible;
      g.position.y = st.y;
      g.scale.set(st.sxz, st.sy, st.sxz);
    });

    const cam = cameraPose(p, sm.current.x, sm.current.y, spin.current);
    state.camera.position.set(cam.x, cam.y, cam.z);
    state.camera.lookAt(0, cam.ty, 0);
    const pc = state.camera as THREE.PerspectiveCamera;
    if (Math.abs(pc.fov - cam.fov) > 0.01) {
      pc.fov = cam.fov;
      pc.updateProjectionMatrix();
    }
  });

  return (
    // The room is authored with its walls on the north/west corner; rotating the
    // whole centered diorama 180 degrees here puts that corner on the far side of
    // the camera's sweep instead, so the walls frame the room from behind rather
    // than sitting between the camera and the furniture.
    <group rotation={[0, Math.PI, 0]}>
      <group position={[-ROOM_W / 2, 0, -ROOM_D / 2]}>
        <group ref={floorRef} visible={false}>
          <Floor />
        </group>
        <group ref={wallsRef} visible={false}>
          <Walls />
        </group>
        {PIECES.map((pc, i) => (
          <group
            key={pc.key}
            ref={(el) => {
              pieceRefs.current[i] = el;
            }}
            position={[pc.x, 0, pc.z]}
            rotation={[0, pc.rotY ?? 0, 0]}
            visible={false}
          >
            {pc.el}
          </group>
        ))}
      </group>
    </group>
  );
}

export interface PixelSceneProps {
  progressTarget: { current: number };
  mouse: { current: { x: number; y: number } };
  reduced: boolean;
}

export function PixelScene({ progressTarget, mouse, reduced }: PixelSceneProps) {
  return (
    <Canvas
      flat
      dpr={PIXEL_DPR}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      camera={{ fov: 38, near: 0.5, far: 140, position: [22, 13.5, 22] }}
    >
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, 34, 78]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[14, 22, 8]} intensity={1.15} />
      <VoidCubes />
      <Rig progressTarget={progressTarget} mouse={mouse} reduced={reduced} />
    </Canvas>
  );
}
