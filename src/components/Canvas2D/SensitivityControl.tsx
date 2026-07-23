import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store/store";
import { IconButton } from "../ui/IconButton";
import { Sliders } from "@phosphor-icons/react";

const MIN = 0.1;
const MAX = 1.5;

/** Popover slider controlling how far resize handles move per pixel of drag, across items, the L-shape editor, and room walls. */
export function SensitivityControl() {
  const resizeSensitivity = useStore((s) => s.resizeSensitivity);
  const setResizeSensitivity = useStore((s) => s.setResizeSensitivity);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        aria-label="Resize sensitivity"
        icon={<Sliders size={16} />}
        active={open}
        onClick={() => setOpen((o) => !o)}
        className="bg-[var(--bg-elevated)] border border-[var(--border)] shadow-[var(--shadow-sm)]"
      />
      {open && (
        <div className="absolute right-9 top-0 flex w-48 flex-col gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">Resize sensitivity</span>
            <span className="tabular-nums text-xs text-[var(--text)]">{Math.round(resizeSensitivity * 100)}%</span>
          </div>
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={0.05}
            value={resizeSensitivity}
            onChange={(e) => setResizeSensitivity(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <p className="text-[10px] text-[var(--text-faint)]">How far resize handles move per pixel dragged (items, L-shapes, walls).</p>
        </div>
      )}
    </div>
  );
}
