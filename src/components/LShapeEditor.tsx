import type { NotchCorner } from "../model/types";
import { lShapePolygon } from "../geometry/lshape";
import { NumberField } from "./ui/NumberField";

export interface LShapeValue {
  overallW: number;
  overallD: number;
  notchCorner: NotchCorner;
  notchWidth: number;
  notchDepth: number;
}

interface LShapeEditorProps {
  value: LShapeValue;
  onChange: (v: LShapeValue) => void;
  unit?: string;
}

const CORNERS: { corner: NotchCorner; label: string }[] = [
  { corner: "nw", label: "Top left" },
  { corner: "ne", label: "Top right" },
  { corner: "sw", label: "Bottom left" },
  { corner: "se", label: "Bottom right" },
];

function cornerPreviewPolygon(corner: NotchCorner): string {
  // small illustrative L for the corner-picker buttons, in a 24x24 box
  const poly = lShapePolygon(24, 24, corner, 10, 10);
  return poly.map((p) => `${p.x},${p.y}`).join(" ");
}

export function LShapeEditor({ value, onChange, unit = "ft" }: LShapeEditorProps) {
  const poly = lShapePolygon(value.overallW, value.overallD, value.notchCorner, value.notchWidth, value.notchDepth);
  const scale = Math.min(160 / value.overallW, 120 / value.overallD, 40);
  const pw = value.overallW * scale;
  const pd = value.overallD * scale;

  function set(patch: Partial<LShapeValue>) {
    const next = { ...value, ...patch };
    next.notchWidth = Math.min(next.notchWidth, next.overallW - 0.5);
    next.notchDepth = Math.min(next.notchDepth, next.overallD - 0.5);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] p-3">
        <svg width={pw + 16} height={pd + 16} viewBox={`-8 -8 ${pw + 16} ${pd + 16}`}>
          <polygon
            points={poly.map((p) => `${p.x * scale},${p.y * scale}`).join(" ")}
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Overall width" value={value.overallW} onChange={(v) => set({ overallW: Math.max(1, v) })} suffix={unit} step={0.25} min={1} />
        <NumberField label="Overall depth" value={value.overallD} onChange={(v) => set({ overallD: Math.max(1, v) })} suffix={unit} step={0.25} min={1} />
      </div>

      <div>
        <span className="mb-1 block text-xs text-[var(--text-muted)]">Notch corner (the cut-out corner)</span>
        <div className="grid grid-cols-4 gap-1.5">
          {CORNERS.map(({ corner, label }) => (
            <button
              key={corner}
              aria-label={label}
              title={label}
              onClick={() => set({ notchCorner: corner })}
              className={
                "flex h-11 items-center justify-center rounded-[var(--radius-control)] border transition-[transform,border-color,background-color] duration-150 " +
                "active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] " +
                (value.notchCorner === corner
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)]")
              }
            >
              <svg width={24} height={24} viewBox="-2 -2 28 28">
                <polygon
                  points={cornerPreviewPolygon(corner)}
                  fill="none"
                  stroke={value.notchCorner === corner ? "var(--accent)" : "var(--text-muted)"}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Notch width"
          value={value.notchWidth}
          onChange={(v) => set({ notchWidth: Math.max(0.25, v) })}
          suffix={unit}
          step={0.25}
          min={0.25}
          max={value.overallW - 0.5}
        />
        <NumberField
          label="Notch depth"
          value={value.notchDepth}
          onChange={(v) => set({ notchDepth: Math.max(0.25, v) })}
          suffix={unit}
          step={0.25}
          min={0.25}
          max={value.overallD - 0.5}
        />
      </div>
    </div>
  );
}
