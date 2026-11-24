import type { Room } from "../model/types";
import type { Vec2 } from "../geometry/types";
import { centroid } from "../geometry/polygon";
import { openingSpan } from "../geometry/openings";
import { worldPolygon, footprintSize } from "../geometry/shape";
import { formatLengthCompact } from "../format/length";
import { fitViewBox, viewBoxString } from "../components/Canvas2D/viewBox";

function xml(value: string): string {
  // JSON permits lone surrogates and controls that XML/data URLs cannot encode.
  // Iterating code points preserves valid surrogate pairs (including emoji).
  const clean = Array.from(value, (character) => {
    const code = character.codePointAt(0)!;
    return code === 9 || code === 10 || code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) || code >= 0x10000
      ? character : "\ufffd";
  }).join("");
  return clean.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}
function points(polygon: Vec2[]): string {
  return polygon.map((point) => `${point.x},${point.y}`).join(" ");
}

/** Export the saved room itself, independent of view mode, zoom, selection, and theme. */
export function createFloorPlanSvg(room: Room): string {
  const viewBox = fitViewBox(room.outline);
  const scale = Math.max(viewBox.w / 1600, viewBox.h / 1200);
  const font = 16 * scale;
  const center = centroid(room.outline);
  const furniture = room.items
    .filter((item) => !item.hidden)
    .map((item) => {
      const polygon = worldPolygon(item);
      const position = centroid(polygon);
      const size = footprintSize(item.footprint);
      const color = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(item.color)
        ? item.color
        : "#8a8f98";
      return `<g><polygon points="${points(polygon)}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/><text x="${position.x}" y="${position.y}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="#202126">${xml(item.name)}<tspan x="${position.x}" dy="${font * 1.3}" font-size="${font * 0.8}" fill="#686b75">${xml(formatLengthCompact(size.w, room.unit))} × ${xml(formatLengthCompact(size.d, room.unit))}</tspan></text></g>`;
    })
    .join("");
  const dimensions = room.outline
    .map((a, index) => {
      const b = room.outline[(index + 1) % room.outline.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 0.001) return "";
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let nx = -(b.y - a.y) / length,
        ny = (b.x - a.x) / length;
      if (nx * (center.x - mid.x) + ny * (center.y - mid.y) > 0) {
        nx = -nx;
        ny = -ny;
      }
      return `<text x="${mid.x + nx * font * 2}" y="${mid.y + ny * font * 2}" text-anchor="middle" dominant-baseline="middle" font-size="${font}" fill="#52525b">${xml(formatLengthCompact(length, room.unit))}</text>`;
    })
    .join("");
  const openings = room.openings
    .map((opening) => {
      const span = openingSpan(room.outline, opening);
      if (!span) return "";
      const gap = `<line x1="${span.start.x}" y1="${span.start.y}" x2="${span.end.x}" y2="${span.end.y}" stroke="white" stroke-width="6" vector-effect="non-scaling-stroke"/>`;
      if (opening.kind === "window")
        return `${gap}<line x1="${span.start.x}" y1="${span.start.y}" x2="${span.end.x}" y2="${span.end.y}" stroke="#2563eb" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      const hinge = opening.hinge === "left" ? span.start : span.end;
      const tip = opening.hinge === "left" ? span.end : span.start;
      const end = {
        x: hinge.x + span.inwardNormal.x * opening.width,
        y: hinge.y + span.inwardNormal.y * opening.width,
      };
      const sweep =
        (tip.x - hinge.x) * (end.y - hinge.y) -
          (tip.y - hinge.y) * (end.x - hinge.x) >
        0
          ? 1
          : 0;
      return `${gap}<path d="M ${hinge.x} ${hinge.y} L ${end.x} ${end.y}" fill="none" stroke="#52525b" stroke-width="1.5" vector-effect="non-scaling-stroke"/><path d="M ${tip.x} ${tip.y} A ${opening.width} ${opening.width} 0 0 ${sweep} ${end.x} ${end.y}" fill="none" stroke="#9298a0" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="${viewBoxString(viewBox)}" role="img" aria-labelledby="plan-title" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><title id="plan-title">${xml(room.name)}</title><rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.w}" height="${viewBox.h}" fill="white"/><polygon points="${points(room.outline)}" fill="white" stroke="#202126" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${furniture}${openings}${dimensions}</svg>`;
}
