import { useId, useMemo } from "react";
import type { Vec2 } from "../../geometry/types";

interface GridProps {
  outline: Vec2[];
}

export function Grid({ outline }: GridProps) {
  const clipId = useId();

  const { lines, minX, minY, maxX, maxY } = useMemo(() => {
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    const minX = Math.floor(Math.min(...xs)) - 1;
    const maxX = Math.ceil(Math.max(...xs)) + 1;
    const minY = Math.floor(Math.min(...ys)) - 1;
    const maxY = Math.ceil(Math.max(...ys)) + 1;

    const lines: { key: string; x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let x = minX; x <= maxX; x++) {
      lines.push({ key: `v${x}`, x1: x, y1: minY, x2: x, y2: maxY, major: x % 5 === 0 });
    }
    for (let y = minY; y <= maxY; y++) {
      lines.push({ key: `h${y}`, x1: minX, y1: y, x2: maxX, y2: y, major: y % 5 === 0 });
    }
    return { lines, minX, minY, maxX, maxY };
  }, [outline]);

  const outlinePoints = outline.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <polygon points={outlinePoints} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x={minX} y={minY} width={maxX - minX} height={maxY - minY} fill="var(--bg-inset)" />
        {lines.map((l) => (
          <line
            key={l.key}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={l.major ? "var(--border-strong)" : "var(--border)"}
            strokeWidth={l.major ? 1.1 : 0.7}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </g>
  );
}
