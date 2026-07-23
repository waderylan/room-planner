import { useMemo, useRef, type RefObject } from "react";
import { useStore } from "../../store/store";
import type { Footprint, Item } from "../../model/types";
import type { Vec2 } from "../../geometry/types";
import { localPolygon, footprintSize, repositionForResize } from "../../geometry/shape";
import { centroid, snap } from "../../geometry/polygon";
import {
  deriveLShapeParams,
  lShapePolygon,
  notchCornerPoint,
  widthHandleX,
  depthHandleY,
  widthHandleOnRight,
  depthHandleOnBottom,
} from "../../geometry/lshape";
import { INCH_FT, formatLengthCompact } from "../../format/length";
import { screenToSvgPoint } from "./svgPoint";

const MIN_SIZE = 0.25; // 3 inches

type ResizeEdge = "n" | "s" | "e" | "w" | "r" | "width" | "depth" | "notch";

/**
 * CSS resize-cursor for a handle that slides along a given local axis, accounting for the
 * item's own rotation — cursor icons are drawn in screen space and are NOT rotated by the
 * SVG transform, so a handle on a vertical edge of a 90deg-rotated item needs a vertical
 * (ns-resize) cursor even though it's the item's local "x" axis.
 */
function axisResizeCursor(rotDeg: number, axis: "x" | "y"): string {
  const angle = axis === "x" ? rotDeg : rotDeg + 90;
  const norm = ((angle % 180) + 180) % 180;
  if (norm < 22.5 || norm >= 157.5) return "ew-resize";
  if (norm < 67.5) return "nesw-resize";
  if (norm < 112.5) return "ns-resize";
  return "nwse-resize";
}

interface FurnitureItemViewProps {
  item: Item;
  selected: boolean;
  invalid: boolean;
  unitsPerPixel: number;
  unit: string;
  svgRef: RefObject<SVGSVGElement | null>;
  snapEnabled: boolean;
  snapStep: number;
  onSelect: (id: string) => void;
  onLiveUpdate: (id: string, pos: Vec2, rotDeg: number) => void;
  onCommitMove: (id: string, pos: Vec2, skipSnap: boolean) => void;
  onCommitRotate: (id: string, rotDeg: number) => void;
  onLiveResize: (id: string, footprint: Footprint, pos: Vec2) => void;
  onCommitResize: (id: string, footprint: Footprint, pos: Vec2) => void;
}

/** Compute the resized footprint + repositioned pos for a single-edge (or radius) drag, anchoring the opposite edge/center in world space. */
function computeResize(
  edge: ResizeEdge,
  footprint: Footprint,
  pos: Vec2,
  rotDeg: number,
  localDx: number,
  localDy: number,
  skipSnap: boolean,
): { footprint: Footprint; pos: Vec2 } {
  const snapVal = (v: number) => (skipSnap ? v : snap(v, INCH_FT));

  if (footprint.kind === "rect") {
    const { w, d } = footprint;
    let newW = w;
    let newD = d;
    let anchorOld: Vec2;
    let anchorNew: Vec2;
    if (edge === "e") {
      newW = Math.max(MIN_SIZE, snapVal(w + localDx));
      anchorOld = { x: 0, y: d / 2 };
      anchorNew = { x: 0, y: d / 2 };
    } else if (edge === "w") {
      newW = Math.max(MIN_SIZE, snapVal(w - localDx));
      anchorOld = { x: w, y: d / 2 };
      anchorNew = { x: newW, y: d / 2 };
    } else if (edge === "s") {
      newD = Math.max(MIN_SIZE, snapVal(d + localDy));
      anchorOld = { x: w / 2, y: 0 };
      anchorNew = { x: w / 2, y: 0 };
    } else {
      newD = Math.max(MIN_SIZE, snapVal(d - localDy));
      anchorOld = { x: w / 2, y: d };
      anchorNew = { x: w / 2, y: newD };
    }
    const oldCenter = { x: w / 2, y: d / 2 };
    const newCenter = { x: newW / 2, y: newD / 2 };
    const newPos = repositionForResize(pos, rotDeg, oldCenter, newCenter, anchorOld, anchorNew);
    return { footprint: { kind: "rect", w: newW, d: newD }, pos: newPos };
  }

  if (footprint.kind === "circle") {
    const newR = Math.max(MIN_SIZE / 2, snapVal(footprint.r + localDx));
    const oldCenter = { x: footprint.r, y: footprint.r };
    const newCenter = { x: newR, y: newR };
    const newPos = repositionForResize(pos, rotDeg, oldCenter, newCenter, oldCenter, newCenter);
    return { footprint: { kind: "circle", r: newR }, pos: newPos };
  }

  if (footprint.kind === "poly") {
    const params = deriveLShapeParams(footprint.points);
    if (!params) return { footprint, pos };
    const corner = params.notchCorner;
    const next = { ...params };
    let anchorOld: Vec2 = { x: 0, y: 0 };
    let anchorNew: Vec2 = { x: 0, y: 0 };

    if (edge === "width") {
      if (widthHandleOnRight(corner)) {
        next.overallW = Math.max(MIN_SIZE, snapVal(params.overallW + localDx));
      } else {
        next.overallW = Math.max(MIN_SIZE, snapVal(params.overallW - localDx));
        anchorOld = { x: params.overallW, y: 0 };
        anchorNew = { x: next.overallW, y: 0 };
      }
      next.notchWidth = Math.min(params.notchWidth, next.overallW - MIN_SIZE);
    } else if (edge === "depth") {
      if (depthHandleOnBottom(corner)) {
        next.overallD = Math.max(MIN_SIZE, snapVal(params.overallD + localDy));
      } else {
        next.overallD = Math.max(MIN_SIZE, snapVal(params.overallD - localDy));
        anchorOld = { x: 0, y: params.overallD };
        anchorNew = { x: 0, y: next.overallD };
      }
      next.notchDepth = Math.min(params.notchDepth, next.overallD - MIN_SIZE);
    } else if (edge === "notch") {
      const signW = corner === "ne" || corner === "se" ? -1 : 1;
      const signD = corner === "sw" || corner === "se" ? -1 : 1;
      next.notchWidth = Math.min(Math.max(MIN_SIZE, snapVal(params.notchWidth + signW * localDx)), params.overallW - MIN_SIZE);
      next.notchDepth = Math.min(Math.max(MIN_SIZE, snapVal(params.notchDepth + signD * localDy)), params.overallD - MIN_SIZE);
    }

    const newPoints = lShapePolygon(next.overallW, next.overallD, next.notchCorner, next.notchWidth, next.notchDepth);
    const oldCenter = centroid(footprint.points);
    const newCenter = centroid(newPoints);
    const newPos = repositionForResize(pos, rotDeg, oldCenter, newCenter, anchorOld, anchorNew);
    return { footprint: { kind: "poly", points: newPoints }, pos: newPos };
  }

  return { footprint, pos };
}

export function FurnitureItemView({
  item,
  selected,
  invalid,
  unitsPerPixel,
  unit,
  svgRef,
  snapEnabled,
  snapStep,
  onSelect,
  onLiveUpdate,
  onCommitMove,
  onCommitRotate,
  onLiveResize,
  onCommitResize,
}: FurnitureItemViewProps) {
  const resizeSensitivity = useStore((s) => s.resizeSensitivity);
  const local = useMemo(() => localPolygon(item.footprint), [item.footprint]);
  const center = useMemo(() => centroid(local), [local]);
  const size = useMemo(() => footprintSize(item.footprint), [item.footprint]);
  const lshapeParams = useMemo(
    () => (item.footprint.kind === "poly" ? deriveLShapeParams(item.footprint.points) : null),
    [item.footprint],
  );

  const dragRef = useRef<
    | { mode: "move"; startSvg: Vec2; startPos: Vec2 }
    | { mode: "rotate" }
    | { mode: "resize"; edge: ResizeEdge; startSvg: Vec2; startFootprint: Footprint; startPos: Vec2 }
    | null
  >(null);
  const lastPosRef = useRef(item.pos);
  const lastRotRef = useRef(item.rotDeg);
  const lastResizeRef = useRef<{ footprint: Footprint; pos: Vec2 }>({ footprint: item.footprint, pos: item.pos });

  const points = local.map((p) => `${p.x},${p.y}`).join(" ");
  const strokeColor = invalid ? "var(--danger)" : selected ? "var(--accent)" : "rgba(0,0,0,0.25)";

  const stickLen = 40 * unitsPerPixel;
  const handleR = 5.5 * unitsPerPixel;
  const handlePos = { x: center.x, y: Math.min(...local.map((p) => p.y)) - stickLen };
  const handleTop = { x: center.x, y: Math.min(...local.map((p) => p.y)) };

  function handleMovePointerDown(e: React.PointerEvent) {
    if (e.button === 1 || e.button === 2) return;
    e.stopPropagation();
    onSelect(item.id);
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const startSvg = screenToSvgPoint(svg, e.clientX, e.clientY);
    dragRef.current = { mode: "move", startSvg, startPos: item.pos };
    lastPosRef.current = item.pos;
  }

  function handleMovePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "move") return;
    const svg = svgRef.current;
    if (!svg) return;
    const cur = screenToSvgPoint(svg, e.clientX, e.clientY);
    const dx = cur.x - drag.startSvg.x;
    const dy = cur.y - drag.startSvg.y;
    const raw = { x: drag.startPos.x + dx, y: drag.startPos.y + dy };
    const skipSnap = e.altKey || !snapEnabled;
    const pos = skipSnap ? raw : { x: snap(raw.x, snapStep), y: snap(raw.y, snapStep) };
    lastPosRef.current = pos;
    onLiveUpdate(item.id, pos, item.rotDeg);
  }

  function handleMovePointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "move") return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    onCommitMove(item.id, lastPosRef.current, true);
  }

  function worldCenterOf(pos: Vec2): Vec2 {
    return { x: pos.x + center.x, y: pos.y + center.y };
  }

  function handleRotatePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    onSelect(item.id);
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode: "rotate" };
    lastRotRef.current = item.rotDeg;
  }

  function handleRotatePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "rotate") return;
    const svg = svgRef.current;
    if (!svg) return;
    const cur = screenToSvgPoint(svg, e.clientX, e.clientY);
    const wc = worldCenterOf(item.pos);
    const rx = cur.x - wc.x;
    const ry = cur.y - wc.y;
    const rad = Math.atan2(rx, -ry);
    let deg = (rad * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (!e.shiftKey) {
      deg = Math.round(deg / 15) * 15;
    } else {
      deg = Math.round(deg);
    }
    lastRotRef.current = deg;
    onLiveUpdate(item.id, item.pos, deg);
  }

  function handleRotatePointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "rotate") return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    onCommitRotate(item.id, lastRotRef.current);
  }

  function handleResizePointerDown(edge: ResizeEdge, e: React.PointerEvent) {
    e.stopPropagation();
    onSelect(item.id);
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const startSvg = screenToSvgPoint(svg, e.clientX, e.clientY);
    dragRef.current = { mode: "resize", edge, startSvg, startFootprint: item.footprint, startPos: item.pos };
    lastResizeRef.current = { footprint: item.footprint, pos: item.pos };
  }

  function handleResizePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "resize") return;
    const svg = svgRef.current;
    if (!svg) return;
    const cur = screenToSvgPoint(svg, e.clientX, e.clientY);
    const dx = cur.x - drag.startSvg.x;
    const dy = cur.y - drag.startSvg.y;
    const rad = (item.rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // project the world-space drag delta onto the item's own (rotated) local axes
    const localDx = (dx * cos + dy * sin) * resizeSensitivity;
    const localDy = (-dx * sin + dy * cos) * resizeSensitivity;
    const skipSnap = e.altKey;
    const result = computeResize(drag.edge, drag.startFootprint, drag.startPos, item.rotDeg, localDx, localDy, skipSnap);
    lastResizeRef.current = result;
    onLiveResize(item.id, result.footprint, result.pos);
  }

  function handleResizePointerUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "resize") return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    onCommitResize(item.id, lastResizeRef.current.footprint, lastResizeRef.current.pos);
  }

  const dimLabel =
    item.footprint.kind === "circle"
      ? `⌀${formatLengthCompact(size.w, unit)}`
      : `${formatLengthCompact(size.w, unit)}×${formatLengthCompact(size.d, unit)}`;
  const fontSize = 10.5 * unitsPerPixel;

  const resizeHandleR = 4.5 * unitsPerPixel;
  const xCursor = axisResizeCursor(item.rotDeg, "x");
  const yCursor = axisResizeCursor(item.rotDeg, "y");
  const resizeHandles: { edge: ResizeEdge; pos: Vec2; cursor: string }[] =
    item.footprint.kind === "rect"
      ? [
          { edge: "e", pos: { x: item.footprint.w, y: item.footprint.d / 2 }, cursor: xCursor },
          { edge: "w", pos: { x: 0, y: item.footprint.d / 2 }, cursor: xCursor },
          { edge: "n", pos: { x: item.footprint.w / 2, y: 0 }, cursor: yCursor },
          { edge: "s", pos: { x: item.footprint.w / 2, y: item.footprint.d }, cursor: yCursor },
        ]
      : item.footprint.kind === "circle"
        ? [{ edge: "r", pos: { x: item.footprint.r * 2, y: item.footprint.r }, cursor: xCursor }]
        : item.footprint.kind === "poly" && lshapeParams
          ? [
              { edge: "width", pos: { x: widthHandleX(lshapeParams.overallW, lshapeParams.notchCorner), y: lshapeParams.overallD / 2 }, cursor: xCursor },
              { edge: "depth", pos: { x: lshapeParams.overallW / 2, y: depthHandleY(lshapeParams.overallD, lshapeParams.notchCorner) }, cursor: yCursor },
              { edge: "notch", pos: notchCornerPoint(lshapeParams), cursor: "move" },
            ]
          : [];

  return (
    <g
      transform={`translate(${item.pos.x} ${item.pos.y}) rotate(${item.rotDeg} ${center.x} ${center.y})`}
      opacity={item.hidden ? 0.35 : 1}
    >
      <polygon
        points={points}
        fill={item.color}
        fillOpacity={0.72}
        stroke={strokeColor}
        strokeWidth={selected || invalid ? 2.4 : 1.4}
        strokeDasharray={invalid ? "6 4" : undefined}
        vectorEffect="non-scaling-stroke"
        onPointerDown={handleMovePointerDown}
        onPointerMove={handleMovePointerMove}
        onPointerUp={handleMovePointerUp}
        style={{ cursor: "grab" }}
      />
      {selected && (
        <polygon
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={5}
          strokeOpacity={0.18}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}

      <g transform={`translate(${center.x} ${center.y}) rotate(${-item.rotDeg})`} pointerEvents="none">
        <text
          x={0}
          y={-fontSize * 0.4}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontWeight={600}
          fill="var(--zinc-950)"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={fontSize * 0.25}
          paintOrder="stroke"
        >
          {item.name}
        </text>
        <text
          x={0}
          y={fontSize * 0.85}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize * 0.85}
          className="tabular-nums"
          fill="var(--zinc-700)"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={fontSize * 0.2}
          paintOrder="stroke"
        >
          {dimLabel}
        </text>
      </g>

      {selected && (
        <g pointerEvents="none">
          <line
            x1={handleTop.x}
            y1={handleTop.y}
            x2={handlePos.x}
            y2={handlePos.y}
            stroke="var(--accent)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
      {selected && (
        <circle
          cx={handlePos.x}
          cy={handlePos.y}
          r={handleR}
          fill="var(--accent)"
          stroke="var(--bg-elevated)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          onPointerDown={handleRotatePointerDown}
          onPointerMove={handleRotatePointerMove}
          onPointerUp={handleRotatePointerUp}
          style={{ cursor: "grab" }}
        />
      )}

      {selected &&
        resizeHandles.map((h) => (
          <rect
            key={h.edge}
            x={h.pos.x - resizeHandleR}
            y={h.pos.y - resizeHandleR}
            width={resizeHandleR * 2}
            height={resizeHandleR * 2}
            rx={resizeHandleR * 0.35}
            fill="var(--bg-elevated)"
            stroke="var(--accent)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: h.cursor }}
            onPointerDown={(e) => handleResizePointerDown(h.edge, e)}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />
        ))}
    </g>
  );
}
