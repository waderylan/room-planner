import type { Vec2 } from "../../geometry/types";
import type { Opening } from "../../model/types";
import { centroid } from "../../geometry/polygon";
import { openingSpan } from "../../geometry/openings";
import { formatLength } from "../../format/length";

interface RoomOutlineViewProps {
  outline: Vec2[];
  openings: Opening[];
  unit: string;
  unitsPerPixel: number;
}

export function RoomOutlineView({ outline, openings, unit, unitsPerPixel }: RoomOutlineViewProps) {
  const points = outline.map((p) => `${p.x},${p.y}`).join(" ");
  const center = centroid(outline);
  const fontSize = 22 * unitsPerPixel;
  const tickInner = 2.5 * unitsPerPixel;
  const tickLen = 16 * unitsPerPixel;
  const labelGap = 10 * unitsPerPixel;

  const n = outline.length;

  return (
    <g>
      <polygon
        points={points}
        fill="none"
        stroke="var(--text)"
        strokeWidth={3.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {outline.map((a, i) => {
        const b = outline[(i + 1) % n];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < 0.01) return null;

        // outward normal (away from the room centroid)
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let nx = -dy;
        let ny = dx;
        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;
        const toCenter = { x: center.x - mid.x, y: center.y - mid.y };
        if (nx * toCenter.x + ny * toCenter.y > 0) {
          nx = -nx;
          ny = -ny;
        }

        // graph-axis style: a short tick perpendicular to the wall at its midpoint,
        // with a stacked "Wall N" / length label anchored just past the tick
        const tickStart = { x: mid.x + nx * tickInner, y: mid.y + ny * tickInner };
        const tickEnd = { x: mid.x + nx * (tickInner + tickLen), y: mid.y + ny * (tickInner + tickLen) };
        const labelPos = {
          x: mid.x + nx * (tickInner + tickLen + labelGap),
          y: mid.y + ny * (tickInner + tickLen + labelGap),
        };
        // lean the stacked lines away from the wall so the tick side stays clear
        const leanSign = ny >= 0 ? 1 : -1;

        return (
          <g key={i}>
            <line
              x1={tickStart.x}
              y1={tickStart.y}
              x2={tickEnd.x}
              y2={tickEnd.y}
              stroke="var(--text-faint)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              stroke="var(--bg)"
              strokeWidth={fontSize * 0.28}
              paintOrder="stroke"
            >
              <tspan x={labelPos.x} dy={leanSign * -fontSize * 0.35} fontSize={fontSize} fontWeight={700} fill="var(--accent)">
                Wall {i + 1}
              </tspan>
              <tspan x={labelPos.x} dy={fontSize * 1.1} fontSize={fontSize * 0.92} fontWeight={500} className="tabular-nums" fill="var(--text-muted)">
                {formatLength(length, unit)}
              </tspan>
            </text>
          </g>
        );
      })}

      {openings.map((o) => {
        const span = openingSpan(outline, o);
        if (!span) return null;
        // g and eraseWidth are screen-pixel distances: with vectorEffect="non-scaling-stroke"
        // a stroke-width is already in screen pixels, so it must NOT be scaled by unitsPerPixel
        // (that conversion is only for values placed in world-space coordinates, like the offset
        // point below). Mixing the two up made this symbol nearly invisible.
        const g = 9 * unitsPerPixel;
        const nrm = span.inwardNormal;
        const eraseWidth = 6.5;

        if (o.kind === "window") {
          const l1a = { x: span.start.x + nrm.x * g, y: span.start.y + nrm.y * g };
          const l1b = { x: span.end.x + nrm.x * g, y: span.end.y + nrm.y * g };
          const l2a = { x: span.start.x - nrm.x * g, y: span.start.y - nrm.y * g };
          const l2b = { x: span.end.x - nrm.x * g, y: span.end.y - nrm.y * g };
          return (
            <g key={o.id}>
              <line x1={span.start.x} y1={span.start.y} x2={span.end.x} y2={span.end.y} stroke="var(--bg-inset)" strokeWidth={eraseWidth} vectorEffect="non-scaling-stroke" />
              <line x1={l1a.x} y1={l1a.y} x2={l1b.x} y2={l1b.y} stroke="var(--text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <line x1={l2a.x} y1={l2a.y} x2={l2b.x} y2={l2b.y} stroke="var(--text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <line x1={l1a.x} y1={l1a.y} x2={l2a.x} y2={l2a.y} stroke="var(--text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <line x1={l1b.x} y1={l1b.y} x2={l2b.x} y2={l2b.y} stroke="var(--text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </g>
          );
        }

        const hinge = o.hinge === "left" ? span.start : span.end;
        const closedTip = o.hinge === "left" ? span.end : span.start;
        const openTip = { x: hinge.x + nrm.x * o.width, y: hinge.y + nrm.y * o.width };
        const cross = (closedTip.x - hinge.x) * (openTip.y - hinge.y) - (closedTip.y - hinge.y) * (openTip.x - hinge.x);
        const sweepFlag = cross > 0 ? 1 : 0;

        return (
          <g key={o.id}>
            <line x1={span.start.x} y1={span.start.y} x2={span.end.x} y2={span.end.y} stroke="var(--bg-inset)" strokeWidth={eraseWidth} vectorEffect="non-scaling-stroke" />
            <line x1={hinge.x} y1={hinge.y} x2={openTip.x} y2={openTip.y} stroke="var(--text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <path
              d={`M ${closedTip.x} ${closedTip.y} A ${o.width} ${o.width} 0 0 ${sweepFlag} ${openTip.x} ${openTip.y}`}
              fill="none"
              stroke="var(--text-faint)"
              strokeWidth={1}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </g>
  );
}
