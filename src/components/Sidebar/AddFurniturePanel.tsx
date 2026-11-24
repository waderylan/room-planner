import { useMemo, useState } from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useStore } from "../../store/store";
import { CUSTOM_PRESET, FURNITURE_PRESETS } from "../../model/presets";
import type { FurniturePreset } from "../../model/presets";
import { footprintSize, localPolygon } from "../../geometry/shape";
import { formatLengthCompact } from "../../format/length";

const CATEGORIES = ["All", "Living", "Bedroom", "Office", "Kitchen", "Bath"] as const;
type Category = typeof CATEGORIES[number];
const categoryIds: Record<Exclude<Category, "All">, string[]> = {
  Living: ["sofa", "loveseat", "armchair", "coffee-table", "tv-stand", "rug", "plant"],
  Bedroom: ["bed-queen", "bed-king", "nightstand", "dresser", "wardrobe"],
  Office: ["desk", "bookshelf", "armchair"],
  Kitchen: ["dining-table", "dining-chair", "fridge", "kitchen-island"],
  Bath: ["toilet", "sink", "bathtub"],
};

export function AddFurniturePanel() {
  const addItem = useStore((s) => s.addItemFromPreset);
  const unit = useStore((s) => s.activeRoom().unit);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const presets = useMemo(() => FURNITURE_PRESETS.filter((preset) =>
    (category === "All" || categoryIds[category].includes(preset.id)) &&
    preset.name.toLowerCase().includes(query.trim().toLowerCase()),
  ), [query, category]);

  return (
    <section data-tour="furniture" className="flex flex-col gap-4 border-b border-[var(--border)] p-4">
      <label className="flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg)] px-3 text-[var(--text-muted)] focus-within:border-[var(--accent)]">
        <MagnifyingGlass size={16} />
        <input aria-label="Search furniture" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search furniture" className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]" />
      </label>
      <div className="flex flex-wrap gap-1" aria-label="Furniture categories">
        {CATEGORIES.map((name) => <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${category === name ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:bg-[var(--bg-inset)]"}`}>{name}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {presets.map((preset) => {
          const size = footprintSize(preset.footprint);
          const scale = unit === "m" ? 0.3048 : 1;
          return (
            <button key={preset.id} onClick={() => addItem(preset)} aria-label={`Add ${preset.name}`} className="group flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] text-left transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
              <div className="relative flex h-[76px] w-full items-center justify-center bg-[var(--bg)]">
                <FurniturePreview preset={preset} />
                <Plus size={14} className="absolute right-2 top-2 text-[var(--text-faint)] transition-colors group-hover:text-[var(--accent)]" />
              </div>
              <div className="w-full px-2.5 py-2.5">
                <div className="truncate text-[11px] font-medium text-[var(--text)]">{preset.name}</div>
                <div className="mt-1 truncate text-[10px] tabular-nums text-[var(--text-muted)]">{formatLengthCompact(size.w * scale, unit)} × {formatLengthCompact(size.d * scale, unit)}</div>
              </div>
            </button>
          );
        })}
      </div>
      {presets.length === 0 && <p className="py-5 text-center text-xs text-[var(--text-muted)]">No furniture found</p>}
      <button onClick={() => addItem(CUSTOM_PRESET)} className="flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-[var(--border-strong)] text-xs font-medium text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><Plus size={14} />Custom furniture</button>
    </section>
  );
}

function FurniturePreview({ preset }: { preset: FurniturePreset }) {
  const size = footprintSize(preset.footprint);
  const padding = Math.max(size.w, size.d) * 0.22;
  const name = preset.id;
  const isBed = name.startsWith("bed-");
  const isSofa = ["sofa", "loveseat", "armchair"].includes(name);
  return (
    <svg aria-hidden="true" viewBox={`${-padding} ${-padding} ${size.w + padding * 2} ${size.d + padding * 2}`} className="h-[60px] w-[80px]">
      <polygon points={localPolygon(preset.footprint).map((p) => `${p.x},${p.y}`).join(" ")} fill={preset.color} fillOpacity={0.18} stroke={preset.color} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
      {isBed && <>
        <rect x={size.w * .08} y={size.d * .07} width={size.w * .37} height={size.d * .19} rx={size.w * .025} fill={preset.color} fillOpacity={.3} stroke={preset.color} strokeWidth={.7} vectorEffect="non-scaling-stroke" />
        <rect x={size.w * .55} y={size.d * .07} width={size.w * .37} height={size.d * .19} rx={size.w * .025} fill={preset.color} fillOpacity={.3} stroke={preset.color} strokeWidth={.7} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={size.w} y1={size.d * .34} y2={size.d * .34} stroke={preset.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </>}
      {isSofa && <>
        <rect x={size.w * .12} y={size.d * .3} width={size.w * .76} height={size.d * .59} rx={size.w * .04} fill={preset.color} fillOpacity={.18} stroke={preset.color} strokeWidth={.8} vectorEffect="non-scaling-stroke" />
        <line x1={size.w * .12} x2={size.w * .88} y1={size.d * .28} y2={size.d * .28} stroke={preset.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </>}
      {name === "desk" && <rect x={size.w * .65} y={size.d * .1} width={size.w * .27} height={size.d * .8} fill={preset.color} fillOpacity={.15} stroke={preset.color} strokeWidth={.7} vectorEffect="non-scaling-stroke" />}
      {name === "plant" && <circle cx={size.w / 2} cy={size.d / 2} r={size.w * .3} fill={preset.color} fillOpacity={.25} />}
    </svg>
  );
}
