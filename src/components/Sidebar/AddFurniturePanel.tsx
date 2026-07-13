import { useStore } from "../../store/store";
import { CUSTOM_PRESET, FURNITURE_PRESETS } from "../../model/presets";
import { PlusCircle } from "@phosphor-icons/react";

export function AddFurniturePanel() {
  const addItemFromPreset = useStore((s) => s.addItemFromPreset);

  return (
    <section className="flex flex-col gap-3 border-b border-[var(--border)] px-3.5 py-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">Add furniture</h2>
      <div className="grid grid-cols-2 gap-1.5">
        {FURNITURE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => addItemFromPreset(preset)}
            className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-left text-xs text-[var(--text)] transition-[transform,border-color,background-color] duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--bg-inset)] active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-[3px] border border-black/10"
              style={{ backgroundColor: preset.color }}
            />
            <span className="truncate">{preset.name}</span>
          </button>
        ))}
        <button
          onClick={() => addItemFromPreset(CUSTOM_PRESET)}
          className="flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-[var(--border-strong)] bg-transparent px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-[transform,border-color,color] duration-150 hover:border-[var(--accent)] hover:text-[var(--accent)] active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <PlusCircle size={14} weight="bold" />
          Custom
        </button>
      </div>
    </section>
  );
}
