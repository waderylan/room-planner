import { useRef } from "react";
import { useStore } from "../store/store";
import { wallSegments } from "../geometry/openings";
import type { DoorHinge } from "../model/types";
import { Dialog } from "./ui/Dialog";
import { LengthField } from "./ui/LengthField";
import { Segmented } from "./ui/Segmented";
import { Button } from "./ui/Button";

interface WallEditorDialogProps {
  wallIndex: number;
  openingId: string;
  onClose: () => void;
}

/**
 * Elevation (side-on) view of a single wall, for placing a window/door on it.
 * Position along the wall (and, for windows, sill height) is set by dragging
 * the opening directly in the elevation; width/height are set numerically.
 */
export function WallEditorDialog({ wallIndex, openingId, onClose }: WallEditorDialogProps) {
  const room = useStore((s) => s.activeRoom());
  const updateOpening = useStore((s) => s.updateOpening);
  const removeOpening = useStore((s) => s.removeOpening);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ clientX: number; clientY: number; offset: number; sillHeight: number } | null>(null);

  const wall = wallSegments(room.outline)[wallIndex];
  const opening = room.openings.find((o) => o.id === openingId);
  const open = Boolean(wall && opening);

  if (!wall || !opening) {
    return <Dialog open={false} onClose={onClose} title="" children={null} />;
  }

  const ceiling = room.ceiling;
  const pad = Math.max(0.6, Math.min(wall.length, ceiling) * 0.12);
  const vbW = wall.length + pad * 2;
  const vbH = ceiling + pad * 2;

  function toSvgY(heightAboveFloor: number) {
    return ceiling - heightAboveFloor;
  }

  function handlePointerDown(e: React.PointerEvent<SVGRectElement>) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { clientX: e.clientX, clientY: e.clientY, offset: opening!.offset, sillHeight: opening!.sillHeight };
  }

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const drag = dragRef.current;
    const svg = svgRef.current;
    if (!drag || !svg || !opening) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / vbW, rect.height / vbH);
    if (scale <= 0) return;
    const dxUnits = (e.clientX - drag.clientX) / scale;
    const dyUnits = (e.clientY - drag.clientY) / scale;
    const patch: { offset: number; sillHeight?: number } = { offset: drag.offset + dxUnits };
    if (opening.kind === "window") patch.sillHeight = drag.sillHeight - dyUnits;
    updateOpening(opening.id, patch);
  }

  function handlePointerUp(e: React.PointerEvent<SVGRectElement>) {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  }

  const otherOpenings = room.openings.filter((o) => o.wallIndex === wallIndex && o.id !== opening.id);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${opening.kind === "door" ? "Door" : "Window"} on wall ${wallIndex + 1}`}
      maxWidthClassName="max-w-md"
      footer={
        <>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              removeOpening(opening.id);
              onClose();
            }}
          >
            Delete
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[var(--text-faint)]">Drag the {opening.kind} to position it on the wall.</p>

        <svg
          ref={svgRef}
          viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`}
          className="h-[220px] w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] touch-none select-none"
        >
          {/* wall face */}
          <rect x={0} y={0} width={wall.length} height={ceiling} fill="var(--bg-elevated)" stroke="var(--border-strong)" strokeWidth={pad * 0.05} />
          {/* floor line */}
          <line x1={0} y1={ceiling} x2={wall.length} y2={ceiling} stroke="var(--text-faint)" strokeWidth={pad * 0.08} vectorEffect="non-scaling-stroke" />

          {otherOpenings.map((o) => (
            <rect
              key={o.id}
              x={o.offset}
              y={toSvgY(o.sillHeight + o.height)}
              width={o.width}
              height={o.height}
              fill="var(--text-faint)"
              opacity={0.25}
            />
          ))}

          <rect
            x={opening.offset}
            y={toSvgY(opening.sillHeight + opening.height)}
            width={opening.width}
            height={opening.height}
            fill={opening.kind === "door" ? "#c99b6a" : "#8fc1e3"}
            fillOpacity={0.55}
            stroke="var(--accent)"
            strokeWidth={pad * 0.06}
            style={{ cursor: opening.kind === "door" ? "ew-resize" : "move" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </svg>

        <div className="grid grid-cols-2 gap-2">
          <LengthField
            label="Width"
            value={opening.width}
            onChange={(v) => updateOpening(opening.id, { width: v })}
            unit={room.unit}
            min={0.5}
          />
          <LengthField
            label="Height"
            value={opening.height}
            onChange={(v) => updateOpening(opening.id, { height: v })}
            unit={room.unit}
            min={0.5}
          />
          <LengthField
            label="Offset from left"
            value={opening.offset}
            onChange={(v) => updateOpening(opening.id, { offset: v })}
            unit={room.unit}
            min={0}
          />
          {opening.kind === "window" ? (
            <LengthField
              label="Sill height"
              value={opening.sillHeight}
              onChange={(v) => updateOpening(opening.id, { sillHeight: v })}
              unit={room.unit}
              min={0}
            />
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--text-muted)]">Sill height</span>
              <div className="flex h-8 items-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] px-2.5 text-xs text-[var(--text-faint)]">
                Floor
              </div>
            </label>
          )}
        </div>

        {opening.kind === "door" && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">Hinge side / swing</span>
            <Segmented<DoorHinge>
              options={[
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
              ]}
              value={opening.hinge}
              onChange={(hinge) => updateOpening(opening.id, { hinge })}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
