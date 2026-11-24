import { useEffect, useState } from "react";
import type { Footprint, Unit } from "../../model/types";
import { footprintSize } from "../../geometry/shape";
import { unitScale } from "../../model/units";
import { useStore } from "../../store/store";
import { useInventoryStore } from "../../inventory/inventoryStore";
import type { InventoryDraft, InventoryEntry } from "../../inventory/types";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { LengthField } from "../ui/LengthField";
import { NumberField } from "../ui/NumberField";

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: InventoryEntry | InventoryDraft;
  onSaved?: (entry: InventoryEntry) => void;
}
const inputClass =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]";

export function InventoryItemDialog({
  open,
  onClose,
  initial,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<Unit>("ft");
  const [kind, setKind] = useState<Footprint["kind"]>("rect");
  const [width, setWidth] = useState(1);
  const [depth, setDepth] = useState(0.6);
  const [height, setHeight] = useState(0.75);
  const [quantity, setQuantity] = useState(1);
  const [url, setUrl] = useState("");
  const [color, setColor] = useState("#8a8f98");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const size = initial ? footprintSize(initial.footprint) : { w: 1, d: 0.6 };
    setName(initial?.name ?? "");
    setKind(initial?.footprint.kind ?? "rect");
    setWidth(size.w);
    setDepth(size.d);
    setHeight(initial?.height ?? 0.75);
    setQuantity(initial?.quantity ?? 1);
    setColor(initial?.color ?? "#8a8f98");
    setUrl(initial?.source?.url ?? "");
    setError(null);
    setUnit(
      useStore.getState().activeProjectId
        ? useStore.getState().activeRoom().unit
        : "ft",
    );
  }, [open, initial]);
  const factor = unitScale("m", unit);
  const editing = initial && "id" in initial;
  function save() {
    let footprint: Footprint =
      kind === "circle"
        ? { kind: "circle", r: width / 2 }
        : { kind: "rect", w: width, d: depth };
    if (kind === "poly" && initial?.footprint.kind === "poly") {
      const size = footprintSize(initial.footprint);
      footprint = {
        kind: "poly",
        points: initial.footprint.points.map((point) => ({
          x: (point.x * width) / size.w,
          y: (point.y * depth) / size.d,
        })),
      };
    }
    const entry = useInventoryStore.getState().saveEntry(
      {
        name,
        footprint,
        height,
        elevation: initial?.elevation ?? 0,
        quantity,
        color,
        ...(initial?.presetId ? { presetId: initial.presetId } : {}),
        ...(initial?.roomHint ? { roomHint: initial.roomHint } : {}),
        ...(url.trim()
          ? { source: { ...initial?.source, url: url.trim() } }
          : {}),
      },
      editing ? initial.id : undefined,
    );
    if (!entry) {
      setError(useInventoryStore.getState().saveError);
      return;
    }
    onSaved?.(entry);
    onClose();
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit furniture" : "New furniture"}
      maxWidthClassName="max-w-md"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="flex flex-col gap-1.5 text-xs">
          <span>Name</span>
          <input
            autoFocus
            className={inputClass}
            aria-label="Furniture name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs">
            <span>Shape</span>
            <select
              aria-label="Furniture shape"
              className={inputClass}
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as Footprint["kind"])
              }
            >
              <option value="rect">Rectangle</option>
              <option value="circle">Circle</option>
              {initial?.footprint.kind === "poly" && (
                <option value="poly">Custom</option>
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs">
            <span>Units</span>
            <select
              aria-label="Furniture units"
              className={inputClass}
              value={unit}
              onChange={(event) => setUnit(event.target.value as Unit)}
            >
              <option value="ft">Feet and inches</option>
              <option value="m">Meters</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LengthField
            label={kind === "circle" ? "Diameter" : "Width"}
            unit={unit}
            min={0.01 * factor}
            value={width * factor}
            onChange={(value) => setWidth(value / factor)}
          />
          {kind !== "circle" && (
            <LengthField
              label="Depth"
              unit={unit}
              min={0.01 * factor}
              value={depth * factor}
              onChange={(value) => setDepth(value / factor)}
            />
          )}
          <LengthField
            label="Height"
            unit={unit}
            min={0.01 * factor}
            value={height * factor}
            onChange={(value) => setHeight(value / factor)}
          />
          <NumberField
            label="Quantity"
            value={quantity}
            onChange={setQuantity}
            min={1}
            max={50}
            step={1}
          />
        </div>
        <label className="flex flex-col gap-1.5 text-xs">
          <span>Product link</span>
          <input
            aria-label="Product link"
            type="url"
            className={inputClass}
            value={url}
            maxLength={2048}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
          />
        </label>
        <label className="flex items-center justify-between text-xs">
          <span>Color</span>
          <input
            aria-label="Furniture color"
            type="color"
            value={
              color.length === 4
                ? "#" +
                  color
                    .slice(1)
                    .split("")
                    .map((character) => character + character)
                    .join("")
                : color
            }
            onChange={(event) => setColor(event.target.value)}
            className="h-8 w-14 rounded-lg border border-[var(--border)]"
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-[var(--danger)]">
            {error}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Save furniture
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
