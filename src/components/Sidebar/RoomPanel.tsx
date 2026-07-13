import { useState } from "react";
import { v4 as uuid } from "uuid";
import { useStore } from "../../store/store";
import type { AlcoveWall, OpeningKind, RoomShape } from "../../model/types";
import { wallSegments } from "../../geometry/openings";
import { NumberField } from "../ui/NumberField";
import { Segmented } from "../ui/Segmented";
import { Button } from "../ui/Button";
import { LShapeEditor } from "../LShapeEditor";
import { WallEditorDialog } from "../WallEditorDialog";
import { Trash, DoorOpen, SquareHalf } from "@phosphor-icons/react";

const WALL_LABELS: Record<AlcoveWall, string> = { n: "North", e: "East", s: "South", w: "West" };

export function RoomPanel() {
  const room = useStore((s) => s.activeRoom());
  const setRoomUnit = useStore((s) => s.setRoomUnit);
  const setRoomShape = useStore((s) => s.setRoomShape);
  const setRoomCeiling = useStore((s) => s.setRoomCeiling);
  const addAlcove = useStore((s) => s.addAlcove);
  const removeAlcove = useStore((s) => s.removeAlcove);
  const addOpening = useStore((s) => s.addOpening);

  const [alcoveWall, setAlcoveWall] = useState<AlcoveWall>("n");
  const [alcoveWidth, setAlcoveWidth] = useState(3);
  const [alcoveDepth, setAlcoveDepth] = useState(2);
  const [alcoveOffset, setAlcoveOffset] = useState(1);
  const [editor, setEditor] = useState<{ wallIndex: number; openingId: string } | null>(null);

  const shape = room.shape;
  const walls = wallSegments(room.outline);

  function addOpeningToWall(wallIndex: number, kind: OpeningKind) {
    const wall = walls[wallIndex];
    if (!wall) return;
    const width = Math.min(kind === "door" ? 3 : 3, Math.max(0.5, wall.length - 0.1));
    const offset = Math.max(0, (wall.length - width) / 2);
    const id = uuid();
    addOpening({
      id,
      kind,
      wallIndex,
      offset,
      width,
      height: kind === "door" ? 6.67 : 3.5,
      sillHeight: kind === "door" ? 0 : 3,
      hinge: "left",
    });
    setEditor({ wallIndex, openingId: id });
  }

  function setShapeKind(kind: RoomShape["kind"]) {
    if (kind === "rect") {
      setRoomShape({ kind: "rect", width: shape.width, length: shape.length });
    } else {
      setRoomShape({
        kind: "lshape",
        width: shape.width,
        length: shape.length,
        notchCorner: shape.notchCorner ?? "ne",
        notchWidth: shape.notchWidth ?? Math.max(1, shape.width / 3),
        notchDepth: shape.notchDepth ?? Math.max(1, shape.length / 3),
      });
    }
  }

  return (
    <section data-tour="room" className="flex flex-col gap-3 border-b border-[var(--border)] px-3.5 py-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Room</h2>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">Units</span>
        <Segmented
          options={[
            { value: "ft", label: "ft" },
            { value: "m", label: "m" },
          ]}
          value={room.unit}
          onChange={setRoomUnit}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">Shape</span>
        <Segmented
          options={[
            { value: "rect", label: "Rectangle" },
            { value: "lshape", label: "L-shape" },
          ]}
          value={shape.kind}
          onChange={setShapeKind}
        />
      </div>

      {shape.kind === "rect" ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Width"
            value={shape.width}
            onChange={(v) => setRoomShape({ ...shape, width: Math.max(1, v) })}
            suffix={room.unit}
            step={0.25}
            min={1}
          />
          <NumberField
            label="Length"
            value={shape.length}
            onChange={(v) => setRoomShape({ ...shape, length: Math.max(1, v) })}
            suffix={room.unit}
            step={0.25}
            min={1}
          />
        </div>
      ) : (
        <LShapeEditor
          unit={room.unit}
          value={{
            overallW: shape.width,
            overallD: shape.length,
            notchCorner: shape.notchCorner ?? "ne",
            notchWidth: shape.notchWidth ?? 1,
            notchDepth: shape.notchDepth ?? 1,
          }}
          onChange={(v) =>
            setRoomShape({
              kind: "lshape",
              width: v.overallW,
              length: v.overallD,
              notchCorner: v.notchCorner,
              notchWidth: v.notchWidth,
              notchDepth: v.notchDepth,
            })
          }
        />
      )}

      <NumberField
        label="Ceiling height"
        value={room.ceiling}
        onChange={(v) => setRoomCeiling(Math.max(1, v))}
        suffix={room.unit}
        step={0.25}
        min={1}
      />

      <details className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] p-2.5 open:pb-3">
        <summary className="cursor-pointer text-xs font-medium text-[var(--text)] select-none">
          Alcoves / bump-outs {room.alcoves.length > 0 && `(${room.alcoves.length})`}
        </summary>
        <div className="mt-2.5 flex flex-col gap-2">
          {room.alcoves.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs"
            >
              <span>
                {WALL_LABELS[a.wall]} wall, {a.width}
                {"×"}
                {a.depth} {room.unit}
              </span>
              <button
                aria-label="Remove alcove"
                onClick={() => removeAlcove(a.id)}
                className="rounded p-1 text-[var(--text-faint)] transition-colors duration-150 hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <Trash size={13} />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">Wall</span>
            <Segmented
              options={[
                { value: "n", label: "N" },
                { value: "e", label: "E" },
                { value: "s", label: "S" },
                { value: "w", label: "W" },
              ]}
              value={alcoveWall}
              onChange={setAlcoveWall}
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="Width" value={alcoveWidth} onChange={setAlcoveWidth} step={0.25} min={0.5} />
            <NumberField label="Depth" value={alcoveDepth} onChange={setAlcoveDepth} step={0.25} min={0.5} />
            <NumberField label="Offset" value={alcoveOffset} onChange={setAlcoveOffset} step={0.25} min={0} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => addAlcove({ wall: alcoveWall, offset: alcoveOffset, width: alcoveWidth, depth: alcoveDepth })}
          >
            Add alcove
          </Button>
        </div>
      </details>

      <details className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] p-2.5 open:pb-3" open>
        <summary className="cursor-pointer text-xs font-medium text-[var(--text)] select-none">
          Windows &amp; doors {room.openings.length > 0 && `(${room.openings.length})`}
        </summary>
        <div className="mt-2.5 flex flex-col gap-1.5">
          {walls.map((wall) => {
            const wallOpenings = room.openings.filter((o) => o.wallIndex === wall.index);
            return (
              <div
                key={wall.index}
                className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">
                    Wall {wall.index + 1} <span className="tabular-nums text-[var(--text-faint)]">({wall.length.toFixed(1)} {room.unit})</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" icon={<SquareHalf size={13} />} onClick={() => addOpeningToWall(wall.index, "window")}>
                      Window
                    </Button>
                    <Button size="sm" variant="ghost" icon={<DoorOpen size={13} />} onClick={() => addOpeningToWall(wall.index, "door")}>
                      Door
                    </Button>
                  </div>
                </div>
                {wallOpenings.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {wallOpenings.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setEditor({ wallIndex: wall.index, openingId: o.id })}
                        className="flex items-center gap-1 rounded-[6px] border border-[var(--border)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                      >
                        {o.kind === "door" ? <DoorOpen size={11} /> : <SquareHalf size={11} />}
                        {o.width.toFixed(1)} {room.unit}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>

      {editor && <WallEditorDialog wallIndex={editor.wallIndex} openingId={editor.openingId} onClose={() => setEditor(null)} />}
    </section>
  );
}
