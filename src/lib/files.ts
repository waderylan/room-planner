import type { Doc } from "../model/types";
import { fitViewBox, viewBoxString } from "../components/Canvas2D/viewBox";
import type { Vec2 } from "../geometry/types";

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

/** Resolve CSS tokens before export so the file works outside the application. */
export function downloadFloorPlan(name: string, outline: Vec2[]) {
  const svg = document.querySelector<SVGSVGElement>("[data-floor-plan] svg");
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const style = getComputedStyle(document.documentElement);
  clone
    .querySelectorAll("[data-editor-only]")
    .forEach((element) => element.remove());
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "1600");
  clone.setAttribute("height", "1200");
  clone.setAttribute("viewBox", viewBoxString(fitViewBox(outline)));
  clone.setAttribute(
    "style",
    "font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; background: " +
      style.getPropertyValue("--bg-inset").trim(),
  );
  let content = new XMLSerializer().serializeToString(clone);
  content = content.replace(/var\((--[\w-]+)\)/g, (_, token: string) =>
    style.getPropertyValue(token).trim(),
  );
  downloadFile(content, `${filename(name)}.svg`, "image/svg+xml");
}
