import type { Doc, Room } from "../model/types";
import { createFloorPlanSvg } from "./floorPlan";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export function downloadFile(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function filename(name: string) {
  return (
    name
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "room-design"
  );
}
export function downloadDesign(doc: Doc, name: string) {
  downloadFile(
    JSON.stringify(doc, null, 2),
    `${filename(name)}.json`,
    "application/json",
  );
}

export function downloadFloorPlan(name: string, room: Room) {
  downloadFile(
    createFloorPlanSvg(room),
    `${filename(name)}.svg`,
    "image/svg+xml",
  );
}
