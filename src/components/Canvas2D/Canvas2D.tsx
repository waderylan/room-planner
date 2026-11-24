import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store/store";
import type { Vec2 } from "../../geometry/types";
import type { Footprint, RoomShape } from "../../model/types";
import { buildOutline } from "../../geometry/roomOutline";
import { worldPolygon, isFullyInside } from "../../geometry/shape";
import { canShareFloorSpace, footprintInteriorsOverlap } from "../../model/collision";
import { fitViewBox, viewBoxString, zoomViewBox, panViewBox, type ViewBox } from "./viewBox";
import { screenToSvgPoint } from "./svgPoint";
import { Grid } from "./Grid";
import { RoomOutlineView } from "./RoomOutlineView";
import { RoomResizeHandles } from "./RoomResizeHandles";
import { FurnitureItemView } from "./FurnitureItemView";
import { Measurements } from "./Measurements";
import { SensitivityControl } from "./SensitivityControl";
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
  const [draftShape, setDraftShape] = useState<RoomShape | null>(null);
  const [viewport, setViewport] = useState({ width: 1000, height: 700 });
  const panRef = useRef<{ startClient: Vec2; startVb: ViewBox } | null>(null);
  const outline = useMemo(() => draftShape ? buildOutline(draftShape, room.alcoves) : room.outline, [draftShape, room.alcoves, room.outline]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // re-fit whenever the outline itself changes (room switch, or a shape/alcove
    // edit that changes the room's size) so the view always recenters on it
    setViewBox(fitViewBox(room.outline));
  }, [room.outline]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !isTypingTarget(e.target) && e.target === svgRef.current) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceHeld(false);
    }
    function onBlur() { setSpaceHeld(false); panRef.current = null; }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
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
    const polys = effectiveItems.map((it) => ({ ...it, poly: worldPolygon(it) }));
    for (let i = 0; i < polys.length; i++) {
      const a = polys[i];
      if (a.hidden) continue;
      if (!isFullyInside(a.poly, outline)) invalid.add(a.id);
      for (let j = i + 1; j < polys.length; j++) {
        const b = polys[j];
        if (canShareFloorSpace(a, b, room.unit)) continue;
        if (footprintInteriorsOverlap(a.poly, b.poly)) {
          invalid.add(a.id);
          invalid.add(b.id);
        }
      }
    }
    return invalid;
  }, [effectiveItems, outline, room.unit]);

  const selected = effectiveItems.find((it) => it.id === room.selectedItemId);

  function unitsPerPixel(): number {
    if (viewport.width <= 0 || viewport.height <= 0) return 0.02;
    return Math.max(viewBox.w / viewport.width, viewBox.h / viewport.height);
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
      const unitScale = room.unit === "m" ? .3048 : 1;
      setViewBox((vb) => zoomViewBox(vb, factor, center, 2 * unitScale, Math.max(200 * unitScale, fitViewBox(room.outline).w * 4)));
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [room.unit, room.outline]);

  function zoomByButton(factor: number) {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    setViewBox((vb) => {
      const center = rect ? screenToSvgPoint(svg!, rect.left + rect.width / 2, rect.top + rect.height / 2) : { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
      const unitScale = room.unit === "m" ? .3048 : 1;
      return zoomViewBox(vb, factor, center, 2 * unitScale, Math.max(200 * unitScale, fitViewBox(room.outline).w * 4));
    });
  }

  function handleBackgroundPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    svgRef.current?.focus({ preventScroll: true });
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
    const pxPerUnit = 1 / Math.max(pan.startVb.w / rect.width, pan.startVb.h / rect.height);
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
        role="img"
        aria-label="Floor plan"
        tabIndex={0}
        viewBox={viewBoxString(viewBox)}
        className="h-full w-full touch-none select-none outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]"
        style={{ cursor: spaceHeld ? "grab" : "default" }}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleBackgroundPointerMove}
        onPointerUp={handleBackgroundPointerUp}
        onPointerCancel={() => { panRef.current = null; setDrag(null); setDraftShape(null); }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || !selected || e.metaKey || e.ctrlKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
          e.preventDefault();
          const step = (snapEnabled ? snapStep : room.unit === "m" ? .01 : 1 / 12) * (e.shiftKey ? 10 : 1);
          moveItem(selected.id, { x: selected.pos.x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0), y: selected.pos.y + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0) }, { skipSnap: true });
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Grid outline={outline} />
        <RoomOutlineView outline={outline} openings={room.openings} unit={room.unit} unitsPerPixel={upp} />
        <g data-editor-only="true"><RoomResizeHandles shape={draftShape ?? room.shape} svgRef={svgRef} unitsPerPixel={upp} onPreview={setDraftShape} /></g>

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
          <g data-editor-only="true"><Measurements
            item={selected}
            outline={outline}
            otherItems={effectiveItems.filter((it) => it.id !== selected.id && !canShareFloorSpace(selected, it, room.unit))}
            mode={room.measureMode}
            unit={room.unit}
            unitsPerPixel={upp}
          /></g>
        )}
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <IconButton
          aria-label="Fit to room"
          icon={<ArrowsOutSimple size={16} />}
          onClick={() => setViewBox(fitViewBox(room.outline))}
          className="bg-[var(--bg-elevated)] border border-[var(--border)] shadow-[var(--shadow-sm)]"
        />
        <SensitivityControl />
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
