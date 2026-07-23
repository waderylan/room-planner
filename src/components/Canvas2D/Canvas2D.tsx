import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store/store";
import type { Vec2 } from "../../geometry/types";
import type { Footprint } from "../../model/types";
import { worldPolygon, isFullyInside } from "../../geometry/shape";
import { polygonsIntersect } from "../../geometry/polygon";
import { fitViewBox, viewBoxString, zoomViewBox, panViewBox, type ViewBox } from "./viewBox";
import { screenToSvgPoint } from "./svgPoint";
import { Grid } from "./Grid";
import { RoomOutlineView } from "./RoomOutlineView";
import { FurnitureItemView } from "./FurnitureItemView";
import { Measurements } from "./Measurements";
import { IconButton } from "../ui/IconButton";
import { ArrowsOutSimple, MagnifyingGlassPlus, MagnifyingGlassMinus } from "@phosphor-icons/react";

const WHEEL_ZOOM_FACTOR = 1.08;
const BUTTON_ZOOM_FACTOR = 1.3;

export function Canvas2D() {
  const room = useStore((s) => s.activeRoom());
  const selectItem = useStore((s) => s.selectItem);
  const moveItem = useStore((s) => s.moveItem);
  const rotateItem = useStore((s) => s.rotateItem);
  const resizeItem = useStore((s) => s.resizeItem);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const snapStep = useStore((s) => s.snapStep);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewBox, setViewBox] = useState<ViewBox>(() => fitViewBox(room.outline));
  const [drag, setDrag] = useState<{ id: string; pos: Vec2; rotDeg: number; footprint?: Footprint } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panRef = useRef<{ startClient: Vec2; startVb: ViewBox } | null>(null);

  useEffect(() => {
    // re-fit whenever the outline itself changes (room switch, or a shape/alcove
    // edit that changes the room's size) so the view always recenters on it
    setViewBox(fitViewBox(room.outline));
  }, [room.outline]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !isTypingTarget(e.target)) {
        setSpaceHeld(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const effectiveItems = useMemo(() => {
    if (!drag) return room.items;
    return room.items.map((it) =>
      it.id === drag.id ? { ...it, pos: drag.pos, rotDeg: drag.rotDeg, footprint: drag.footprint ?? it.footprint } : it,
    );
  }, [room.items, drag]);

  const invalidIds = useMemo(() => {
    const invalid = new Set<string>();
    const polys = effectiveItems.map((it) => ({ id: it.id, poly: worldPolygon(it), hidden: it.hidden }));
    for (const a of polys) {
      if (a.hidden) continue;
      if (!isFullyInside(a.poly, room.outline)) invalid.add(a.id);
      for (const b of polys) {
        if (a.id === b.id || b.hidden) continue;
        if (polygonsIntersect(a.poly, b.poly)) {
          invalid.add(a.id);
          invalid.add(b.id);
        }
      }
    }
    return invalid;
  }, [effectiveItems, room.outline]);

  const selected = effectiveItems.find((it) => it.id === room.selectedItemId);

  function unitsPerPixel(): number {
    const svg = svgRef.current;
    if (!svg) return 0.02;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return 0.02;
    return viewBox.w / rect.width;
  }

  useEffect(() => {
    // Attached as a native (non-passive) listener rather than React's onWheel: React
    // registers wheel handlers as passive by default, so calling preventDefault() from
    // a JSX onWheel prop is silently ignored and the browser still pinch/ctrl-zooms the
    // whole page on trackpads. A real addEventListener with { passive: false } is the
    // only way to actually suppress that and keep the zoom scoped to the canvas.
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const center = screenToSvgPoint(svg!, e.clientX, e.clientY);
      const factor = e.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      setViewBox((vb) => zoomViewBox(vb, factor, center));
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  function zoomByButton(factor: number) {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    setViewBox((vb) => {
      const center = rect ? screenToSvgPoint(svg!, rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      return zoomViewBox(vb, factor, center);
    });
  }

  function handleBackgroundPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const isPanTrigger = e.button === 1 || (e.button === 0 && spaceHeld);
    if (isPanTrigger) {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      panRef.current = { startClient: { x: e.clientX, y: e.clientY }, startVb: viewBox };
      return;
    }
    if (e.button === 0) {
      selectItem(null);
    }
  }

  function handleBackgroundPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const pan = panRef.current;
    if (!pan) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pxPerUnit = rect.width / pan.startVb.w;
    const dx = (e.clientX - pan.startClient.x) / pxPerUnit;
    const dy = (e.clientY - pan.startClient.y) / pxPerUnit;
    setViewBox(panViewBox(pan.startVb, -dx, -dy));
  }

  function handleBackgroundPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (panRef.current) {
      (e.target as Element).releasePointerCapture(e.pointerId);
      panRef.current = null;
    }
  }

  const upp = unitsPerPixel();

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--bg-inset)]">
      <svg
        ref={svgRef}
        viewBox={viewBoxString(viewBox)}
        className="h-full w-full touch-none select-none"
        style={{ cursor: spaceHeld ? "grab" : "default" }}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleBackgroundPointerMove}
        onPointerUp={handleBackgroundPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Grid outline={room.outline} />
        <RoomOutlineView outline={room.outline} openings={room.openings} unit={room.unit} unitsPerPixel={upp} />

        {effectiveItems
          .filter((it) => !it.hidden)
          .map((item) => (
            <FurnitureItemView
              key={item.id}
              item={item}
              selected={item.id === room.selectedItemId}
              invalid={invalidIds.has(item.id)}
              unitsPerPixel={upp}
              unit={room.unit}
              svgRef={svgRef}
              snapEnabled={snapEnabled}
              snapStep={snapStep}
              onSelect={selectItem}
              onLiveUpdate={(id, pos, rotDeg) => setDrag({ id, pos, rotDeg })}
              onCommitMove={(id, pos, skipSnap) => {
                setDrag(null);
                moveItem(id, pos, { skipSnap });
              }}
              onCommitRotate={(id, rotDeg) => {
                setDrag(null);
                rotateItem(id, rotDeg);
              }}
              onLiveResize={(id, footprint, pos) => setDrag({ id, pos, rotDeg: item.rotDeg, footprint })}
              onCommitResize={(id, footprint, pos) => {
                setDrag(null);
                resizeItem(id, footprint, pos);
              }}
            />
          ))}

        {selected && !selected.hidden && (
          <Measurements
            item={selected}
            outline={room.outline}
            otherItems={effectiveItems.filter((it) => it.id !== selected.id)}
            mode={room.measureMode}
            unit={room.unit}
            unitsPerPixel={upp}
          />
        )}
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <IconButton
          aria-label="Fit to room"
          icon={<ArrowsOutSimple size={16} />}
          onClick={() => setViewBox(fitViewBox(room.outline))}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] shadow-[var(--shadow-sm)]"
        />
        <IconButton
          aria-label="Zoom in"
          icon={<MagnifyingGlassPlus size={16} />}
          onClick={() => zoomByButton(1 / BUTTON_ZOOM_FACTOR)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] shadow-[var(--shadow-sm)]"
        />
        <IconButton
          aria-label="Zoom out"
          icon={<MagnifyingGlassMinus size={16} />}
          onClick={() => zoomByButton(BUTTON_ZOOM_FACTOR)}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] shadow-[var(--shadow-sm)]"
        />
      </div>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}
