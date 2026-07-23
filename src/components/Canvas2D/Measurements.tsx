import { useMemo } from "react";
import type { Item, MeasureMode } from "../../model/types";
import type { Vec2 } from "../../geometry/types";
import { computeClearance } from "../../geometry/clearance";
import { formatLength } from "../../format/length";

const TOUCH_THRESHOLD = 0.25;

interface MeasurementsProps {
  item: Item;
  outline: Vec2[];
  otherItems: Item[];
  mode: MeasureMode;
  unit: string;
  unitsPerPixel: number;
}

function colorFor(target: "wall" | "furniture"): string {
  return target === "wall" ? "var(--accent)" : "var(--furniture-clearance)";
}

export function Measurements({ item, outline, otherItems, mode, unit, unitsPerPixel }: MeasurementsProps) {
  const result = useMemo(() => computeClearance(item, outline, otherItems, mode), [item, outline, otherItems, mode]);

  const fontSize = 10.5 * unitsPerPixel;
  const tick = 5 * unitsPerPixel;

  return (
    <g pointerEvents="none">
      {result.gaps.map((gap) => {
        const dx = gap.hitPoint.x - gap.origin.x;
        const dy = gap.hitPoint.y - gap.origin.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.02) return null;
        const nx = -dy / len;
        const ny = dx / len;
        const mid = { x: (gap.origin.x + gap.hitPoint.x) / 2, y: (gap.origin.y + gap.hitPoint.y) / 2 };
        const color = colorFor(gap.target);
        const touching = gap.distance < TOUCH_THRESHOLD;
        return (
          <g key={gap.direction} opacity={0.9}>
            <line
              x1={gap.origin.x}
              y1={gap.origin.y}
              x2={gap.hitPoint.x}
              y2={gap.hitPoint.y}
              stroke={color}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={gap.hitPoint.x - nx * tick}
              y1={gap.hitPoint.y - ny * tick}
              x2={gap.hitPoint.x + nx * tick}
              y2={gap.hitPoint.y + ny * tick}
              stroke={color}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={mid.x}
              y={mid.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize}
              className="tabular-nums"
              fill={color}
              stroke="var(--bg-elevated)"
              strokeWidth={fontSize * 0.28}
              paintOrder="stroke"
            >
              {touching ? "touching" : formatLength(gap.distance, unit)}
            </text>
          </g>
        );
      })}

      {(() => {
        const c = result.closest;
        const dx = c.to.x - c.from.x;
        const dy = c.to.y - c.from.y;
        const len = Math.hypot(dx, dy);
        const color = colorFor(c.target);
        const mid = { x: (c.from.x + c.to.x) / 2, y: (c.from.y + c.to.y) / 2 };
        const touching = c.distance < TOUCH_THRESHOLD;
        if (len < 0.02 && !touching) return null;
        return (
          <g>
            <line
              x1={c.from.x}
              y1={c.from.y}
              x2={c.to.x}
              y2={c.to.y}
              stroke={color}
              strokeWidth={2.6}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={c.from.x} cy={c.from.y} r={3 * unitsPerPixel} fill={color} />
            <circle cx={c.to.x} cy={c.to.y} r={3 * unitsPerPixel} fill={color} />
            <text
              x={mid.x}
              y={mid.y - fontSize * 1.3}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize * 1.15}
              fontWeight={700}
              fill={color}
              stroke="var(--bg-elevated)"
              strokeWidth={fontSize * 0.32}
              paintOrder="stroke"
            >
              Closest: {touching ? "touching" : formatLength(c.distance, unit)}
            </text>
          </g>
        );
      })()}
    </g>
  );
}
