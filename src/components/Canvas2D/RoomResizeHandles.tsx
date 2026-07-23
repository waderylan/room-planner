import { useRef, type RefObject } from "react";
import { useStore } from "../../store/store";
import type { Vec2 } from "../../geometry/types";
import type { RoomShape } from "../../model/types";
import { snap } from "../../geometry/polygon";
import { notchCornerPoint } from "../../geometry/lshape";
import { INCH_FT } from "../../format/length";
import { screenToSvgPoint } from "./svgPoint";

interface RoomResizeHandlesProps {
  shape: RoomShape;
  svgRef: RefObject<SVGSVGElement | null>;
  unitsPerPixel: number;
}

type DragMode = "width" | "depth" | "notch";

const MIN_ROOM_SIZE = 1; // 1 ft

/**
 * Drag handles for resizing the room directly on the canvas. The outline is always anchored
 * at (0,0) with no independent position (unlike furniture items), so only the east wall
 * (width) and south wall (depth) can be dragged without shifting every item/opening/alcove
 * to compensate — matching how the sidebar's numeric width/length fields already behave.
 */
export function RoomResizeHandles({ shape, svgRef, unitsPerPixel }: RoomResizeHandlesProps) {
  const setRoomShape = useStore((s) => s.setRoomShape);
  const resizeSensitivity = useStore((s) => s.resizeSensitivity);
  const dragRef = useRef<{ mode: DragMode; startSvg: Vec2; start: RoomShape } | null>(null);

  function handlePointerDown(mode: DragMode, e: React.PointerEvent) {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startSvg: screenToSvgPoint(svg, e.clientX, e.clientY), start: shape };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg) return;
    const cur = screenToSvgPoint(svg, e.clientX, e.clientY);
    const dx = (cur.x - drag.startSvg.x) * resizeSensitivity;
    const dy = (cur.y - drag.startSvg.y) * resizeSensitivity;
    const skipSnap = e.altKey;
    const snapv = (v: number) => (skipSnap ? v : snap(v, INCH_FT));
    const start = drag.start;

    if (drag.mode === "width") {
      setRoomShape({ ...start, width: Math.max(MIN_ROOM_SIZE, snapv(start.width + dx)) });
    } else if (drag.mode === "depth") {
      setRoomShape({ ...start, length: Math.max(MIN_ROOM_SIZE, snapv(start.length + dy)) });
    } else if (start.kind === "lshape") {
      const corner = start.notchCorner ?? "se";
      const signW = corner === "ne" || corner === "se" ? -1 : 1;
      const signD = corner === "sw" || corner === "se" ? -1 : 1;
      const nw = Math.max(0.5, snapv((start.notchWidth ?? 0) + signW * dx));
      const nd = Math.max(0.5, snapv((start.notchDepth ?? 0) + signD * dy));
      setRoomShape({ ...start, notchWidth: nw, notchDepth: nd });
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  }

  const r = 5 * unitsPerPixel;
  const widthPos = { x: shape.width, y: shape.length / 2 };
  const depthPos = { x: shape.width / 2, y: shape.length };
  const notchPos =
    shape.kind === "lshape"
      ? notchCornerPoint({
          overallW: shape.width,
          overallD: shape.length,
          notchCorner: shape.notchCorner ?? "se",
          notchWidth: shape.notchWidth ?? 0,
          notchDepth: shape.notchDepth ?? 0,
        })
      : null;

  return (
    <g>
      <rect
        x={widthPos.x - r}
        y={widthPos.y - r}
        width={r * 2}
        height={r * 2}
        rx={r * 0.35}
        fill="var(--bg-elevated)"
        stroke="var(--accent)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: "ew-resize" }}
        onPointerDown={(e) => handlePointerDown("width", e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <rect
        x={depthPos.x - r}
        y={depthPos.y - r}
        width={r * 2}
        height={r * 2}
        rx={r * 0.35}
        fill="var(--bg-elevated)"
        stroke="var(--accent)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: "ns-resize" }}
        onPointerDown={(e) => handlePointerDown("depth", e)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {notchPos && (
        <rect
          x={notchPos.x - r}
          y={notchPos.y - r}
          width={r * 2}
          height={r * 2}
          rx={r * 0.35}
          fill="var(--accent)"
          stroke="var(--bg-elevated)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: "move" }}
          onPointerDown={(e) => handlePointerDown("notch", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}
    </g>
  );
}
