import { useStore } from "../../store/store";
import type { Footprint } from "../../model/types";
import { footprintSize } from "../../geometry/shape";
import { deriveLShapeParams, lShapePolygon } from "../../geometry/lshape";
import { NumberField } from "../ui/NumberField";
import { Segmented } from "../ui/Segmented";
import { LShapeEditor } from "../LShapeEditor";

type ShapeKind = "rect" | "circle" | "lshape";

function shapeKindOf(fp: Footprint): ShapeKind {
  if (fp.kind === "rect") return "rect";
  if (fp.kind === "circle") return "circle";
  return "lshape";
}

export function Inspector() {
  const room = useStore((s) => s.activeRoom());
  const updateItem = useStore((s) => s.updateItem);
  const item = room.items.find((it) => it.id === room.selectedItemId);

  if (!item) {
    return (
      <section className="flex flex-col gap-2 border-b border-[var(--border)] px-3.5 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Inspector</h2>
        <p className="rounded-[var(--radius-control)] border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--text-muted)]">
          Select a piece of furniture to edit it.
        </p>
      </section>
    );
  }

  const kind = shapeKindOf(item.footprint);
  const size = footprintSize(item.footprint);

  function setShapeKind(next: ShapeKind) {
    if (!item) return;
    if (next === "rect") {
      updateItem(item.id, { footprint: { kind: "rect", w: size.w, d: size.d } });
    } else if (next === "circle") {
      updateItem(item.id, { footprint: { kind: "circle", r: Math.max(size.w, size.d) / 2 } });
    } else {
      updateItem(item.id, {
        footprint: {
          kind: "poly",
          points: lShapePolygon(size.w, size.d, "ne", Math.max(0.5, size.w / 3), Math.max(0.5, size.d / 3)),
        },
      });
    }
  }

  return (
    <section className="flex flex-col gap-3 border-b border-[var(--border)] px-3.5 py-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Inspector</h2>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-[var(--text-muted)]">Name</span>
        <input
          value={item.name}
          onChange={(e) => updateItem(item.id, { name: e.target.value })}
          className="h-8 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 text-sm text-[var(--text)] outline-none transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)]"
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">Shape</span>
        <Segmented
          options={[
            { value: "rect", label: "Rect" },
            { value: "circle", label: "Circle" },
            { value: "lshape", label: "L-shape" },
          ]}
          value={kind}
          onChange={setShapeKind}
        />
      </div>

      {kind === "rect" && item.footprint.kind === "rect" && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Width"
            value={item.footprint.w}
            onChange={(v) => updateItem(item.id, { footprint: { kind: "rect", w: Math.max(0.25, v), d: (item.footprint as { d: number }).d } })}
            suffix={room.unit}
            step={0.25}
            min={0.25}
          />
          <NumberField
            label="Depth"
            value={item.footprint.d}
            onChange={(v) => updateItem(item.id, { footprint: { kind: "rect", w: (item.footprint as { w: number }).w, d: Math.max(0.25, v) } })}
            suffix={room.unit}
            step={0.25}
            min={0.25}
          />
        </div>
      )}

      {kind === "circle" && item.footprint.kind === "circle" && (
        <NumberField
          label="Radius"
          value={item.footprint.r}
          onChange={(v) => updateItem(item.id, { footprint: { kind: "circle", r: Math.max(0.1, v) } })}
          suffix={room.unit}
          step={0.1}
          min={0.1}
        />
      )}

      {kind === "lshape" && item.footprint.kind === "poly" && (
        <LShapeEditor
          unit={room.unit}
          value={
            deriveLShapeParams(item.footprint.points) ?? {
              overallW: size.w,
              overallD: size.d,
              notchCorner: "ne",
              notchWidth: Math.max(0.5, size.w / 3),
              notchDepth: Math.max(0.5, size.d / 3),
            }
          }
          onChange={(v) =>
            updateItem(item.id, {
              footprint: { kind: "poly", points: lShapePolygon(v.overallW, v.overallD, v.notchCorner, v.notchWidth, v.notchDepth) },
            })
          }
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Height" value={item.height} onChange={(v) => updateItem(item.id, { height: Math.max(0.05, v) })} suffix={room.unit} step={0.1} min={0.05} />
        <NumberField label="Elevation" value={item.elevation} onChange={(v) => updateItem(item.id, { elevation: Math.max(0, v) })} suffix={room.unit} step={0.1} min={0} />
      </div>

      <NumberField
        label="Rotation"
        value={item.rotDeg}
        onChange={(v) => updateItem(item.id, { rotDeg: ((v % 360) + 360) % 360 })}
        suffix="deg"
        step={1}
      />

      <label className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">Color</span>
        <input
          type="color"
          value={item.color}
          onChange={(e) => updateItem(item.id, { color: e.target.value })}
          className="h-8 w-14 cursor-pointer rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
      </label>
    </section>
  );
}
