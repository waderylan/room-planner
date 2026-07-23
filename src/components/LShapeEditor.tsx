import { useRef } from "react";
import type { NotchCorner } from "../model/types";
import type { Vec2 } from "../geometry/types";
import { lShapePolygon, notchCornerPoint, widthHandleX, depthHandleY, widthHandleOnRight, depthHandleOnBottom } from "../geometry/lshape";
import { snap } from "../geometry/polygon";
import { INCH_FT } from "../format/length";
import { screenToSvgPoint } from "./Canvas2D/svgPoint";
import { LengthField } from "./ui/LengthField";

export interface LShapeValue {
  overallW: number;
  overallD: number;
  notchCorner: NotchCorner;
  notchWidth: number;
  notchDepth: number;
}

interface LShapeEditorProps {
  value: LShapeValue;
  onChange: (v: LShapeValue) => void;
  unit?: string;
}

const CORNERS: { corner: NotchCorner; label: string }[] = [
  { corner: "nw", label: "Top left" },
  { corner: "ne", label: "Top right" },
  { corner: "sw", label: "Bottom left" },
  { corner: "se", label: "Bottom right" },
];

function cornerPreviewPolygon(corner: NotchCorner): string {
  // small illustrative L for the corner-picker buttons, in a 24x24 box
  const poly = lShapePolygon(24, 24, corner, 10, 10);
  return poly.map((p) => `${p.x},${p.y}`).join(" ");
}

type DragMode = "width" | "depth" | "notch";

export function LShapeEditor({ value, onChange, unit = "ft" }: LShapeEditorProps) {
  const poly = lShapePolygon(value.overallW, value.overallD, value.notchCorner, value.notchWidth, value.notchDepth);
  const scale = Math.min(160 / value.overallW, 120 / value.overallD, 40);
  const pw = value.overallW * scale;
  const pd = value.overallD * scale;

  const svgRef = useRef<SVGSVGElement | null>(null);
  // startScale is captured once per drag so resizing the shape mid-drag (which changes
  // `scale` above, since the preview always fits a fixed pixel box) can't feed back into
  // the drag math — without it, growing the shape shrinks the scale, which makes the same
  // mouse movement map to an ever-larger value delta, i.e. runaway/exponential sensitivity.
  const dragRef = useRef<{ mode: DragMode; startSvg: Vec2; start: LShapeValue; startScale: number } | null>(null);

  function set(patch: Partial<LShapeValue>) {
    const next = { ...value, ...patch };
    next.notchWidth = Math.min(next.notchWidth, next.overallW - 0.5);
    next.notchDepth = Math.min(next.notchDepth, next.overallD - 0.5);
    onChange(next);
  }

  function handlePointerDown(mode: DragMode, e: React.PointerEvent) {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { mode, startSvg: screenToSvgPoint(svg, e.clientX, e.clientY), start: value, startScale: scale };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg) return;
    const cur = screenToSvgPoint(svg, e.clientX, e.clientY);
    const dxVal = (cur.x - drag.startSvg.x) / drag.startScale;
    const dyVal = (cur.y - drag.startSvg.y) / drag.startScale;
    const skipSnap = e.altKey;
    const snapv = (v: number) => (skipSnap ? v : snap(v, INCH_FT));
    const start = drag.start;

    if (drag.mode === "width") {
      const grow = widthHandleOnRight(start.notchCorner) ? dxVal : -dxVal;
      set({ overallW: Math.max(1, snapv(start.overallW + grow)) });
    } else if (drag.mode === "depth") {
      const grow = depthHandleOnBottom(start.notchCorner) ? dyVal : -dyVal;
      set({ overallD: Math.max(1, snapv(start.overallD + grow)) });
    } else {
      const signW = start.notchCorner === "ne" || start.notchCorner === "se" ? -1 : 1;
      const signD = start.notchCorner === "sw" || start.notchCorner === "se" ? -1 : 1;
      const nw = Math.max(0.25, snapv(start.notchWidth + signW * dxVal));
      const nd = Math.max(0.25, snapv(start.notchDepth + signD * dyVal));
      set({ notchWidth: nw, notchDepth: nd });
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  }

  const notchPt = notchCornerPoint(value);
  const widthX = widthHandleX(value.overallW, value.notchCorner);
  const depthY = depthHandleY(value.overallD, value.notchCorner);
  const handleR = 6;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
        <svg
          ref={svgRef}
          width={pw + 16}
          height={pd + 16}
          viewBox={`-8 -8 ${pw + 16} ${pd + 16}`}
          className="touch-none select-none overflow-visible"
        >
          <polygon
            points={poly.map((p) => `${p.x * scale},${p.y * scale}`).join(" ")}
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* overall-width handle: sits on the full-length vertical edge opposite the notch */}
          <circle
            cx={widthX * scale}
            cy={pd / 2}
            r={handleR}
            fill="var(--bg-elevated)"
            stroke="var(--accent)"
            strokeWidth={2}
            style={{ cursor: "ew-resize" }}
            onPointerDown={(e) => handlePointerDown("width", e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          {/* overall-depth handle: sits on the full-length horizontal edge opposite the notch */}
          <circle
            cx={pw / 2}
            cy={depthY * scale}
            r={handleR}
            fill="var(--bg-elevated)"
            stroke="var(--accent)"
            strokeWidth={2}
            style={{ cursor: "ns-resize" }}
            onPointerDown={(e) => handlePointerDown("depth", e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          {/* notch (cut-out corner) handle */}
          <circle
            cx={notchPt.x * scale}
            cy={notchPt.y * scale}
            r={handleR}
            fill="var(--accent)"
            stroke="var(--bg-elevated)"
            strokeWidth={2}
            style={{ cursor: "move" }}
            onPointerDown={(e) => handlePointerDown("notch", e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </svg>
        <p className="text-center text-[10px] text-[var(--text-faint)]">
          Drag the outer edges to resize, or the highlighted corner to reshape the cut-out.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LengthField label="Overall width" value={value.overallW} onChange={(v) => set({ overallW: Math.max(1, v) })} unit={unit} min={1} />
        <LengthField label="Overall depth" value={value.overallD} onChange={(v) => set({ overallD: Math.max(1, v) })} unit={unit} min={1} />
      </div>

      <div>
        <span className="mb-1 block text-xs text-[var(--text-muted)]">Notch corner (the cut-out corner)</span>
        <div className="grid grid-cols-4 gap-1.5">
          {CORNERS.map(({ corner, label }) => (
            <button
              key={corner}
              aria-label={label}
              title={label}
              onClick={() => set({ notchCorner: corner })}
              className={
                "flex h-11 items-center justify-center rounded-[var(--radius-control)] border transition-[transform,border-color,background-color] duration-150 " +
                "active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] " +
                (value.notchCorner === corner
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]")
              }
            >
              <svg width={24} height={24} viewBox="-2 -2 28 28">
                <polygon
                  points={cornerPreviewPolygon(corner)}
                  fill="none"
                  stroke={value.notchCorner === corner ? "var(--accent)" : "var(--text-muted)"}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LengthField
          label="Cut-out width"
          value={value.notchWidth}
          onChange={(v) => set({ notchWidth: Math.max(0.25, v) })}
          unit={unit}
          min={0.25}
          max={value.overallW - 0.5}
        />
        <LengthField
          label="Cut-out depth"
          value={value.notchDepth}
          onChange={(v) => set({ notchDepth: Math.max(0.25, v) })}
          unit={unit}
          min={0.25}
          max={value.overallD - 0.5}
        />
      </div>
      <p className="-mt-1.5 text-[10px] text-[var(--text-faint)]">
        Cut-out width/depth is the size of the missing rectangle that turns the room into an L.
      </p>
    </div>
  );
}
