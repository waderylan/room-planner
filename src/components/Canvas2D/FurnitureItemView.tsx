import { useMemo, useRef, type RefObject } from "react";
import type { Item } from "../../model/types";
import type { Vec2 } from "../../geometry/types";
import { localPolygon, footprintSize } from "../../geometry/shape";
import { centroid, snap } from "../../geometry/polygon";
import { screenToSvgPoint } from "./svgPoint";

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
}: FurnitureItemViewProps) {
  const local = useMemo(() => localPolygon(item.footprint), [item.footprint]);
  const center = useMemo(() => centroid(local), [local]);
  const size = useMemo(() => footprintSize(item.footprint), [item.footprint]);

  const dragRef = useRef<{ mode: "move"; startSvg: Vec2; startPos: Vec2 } | { mode: "rotate" } | null>(null);
  const lastPosRef = useRef(item.pos);
  const lastRotRef = useRef(item.rotDeg);

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

  const dimLabel = item.footprint.kind === "circle" ? `r${size.w / 2}` : `${size.w.toFixed(1)}×${size.d.toFixed(1)}`;
  const fontSize = 10.5 * unitsPerPixel;

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
          {dimLabel} {unit}
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
    </g>
  );
}
