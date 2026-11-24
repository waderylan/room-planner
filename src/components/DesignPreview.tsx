import { useId } from "react";
import type { Doc } from "../model/types";
import { worldPolygon } from "../geometry/shape";
import { openingSpan } from "../geometry/openings";

export function DesignPreview({ doc }: { doc: Doc }) {
  const id = useId().replace(/:/g, "");
  const room = doc.rooms.find((r) => r.id === doc.activeRoomId) ?? doc.rooms[0];
  const xs = room.outline.map((p) => p.x);
  const ys = room.outline.map((p) => p.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys);
  const width = Math.max(...xs) - minX,
    height = Math.max(...ys) - minY;
  const pad = Math.max(width, height) * 0.19;
  const points = (ps: { x: number; y: number }[]) =>
    ps.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`}
      className="design-preview"
      aria-hidden="true"
    >
      <defs>
        <pattern id={id} width="1" height="1" patternUnits="userSpaceOnUse">
          <path
            d="M 1 0 L 0 0 0 1"
            fill="none"
            stroke="var(--preview-grid)"
            strokeWidth="0.02"
          />
        </pattern>
      </defs>
      <polygon
        points={points(room.outline)}
        fill="var(--preview-floor)"
        stroke="var(--preview-wall)"
        strokeWidth={0.15}
        strokeLinejoin="round"
      />
      <polygon points={points(room.outline)} fill={`url(#${id})`} />
      {room.items
        .filter((i) => !i.hidden)
        .map((item) => (
          <polygon
            key={item.id}
            points={points(worldPolygon(item))}
            fill={item.color}
            fillOpacity={0.75}
            stroke={item.color}
            strokeWidth={0.06}
            strokeLinejoin="round"
          />
        ))}
      {room.openings.map((opening) => {
        const span = openingSpan(room.outline, opening);
        return (
          span && (
            <line
              key={opening.id}
              x1={span.start.x}
              y1={span.start.y}
              x2={span.end.x}
              y2={span.end.y}
              stroke={
                opening.kind === "door"
                  ? "var(--preview-floor)"
                  : "var(--accent)"
              }
              strokeWidth={0.19}
            />
          )
        );
      })}
    </svg>
  );
}
