import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

interface MenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
}

export function Menu({ trigger, items, align = "right" }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && items.length > 0 && (
        <div
          className={
            "absolute z-40 mt-1 min-w-[10rem] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-[var(--shadow-md)] transition-[opacity,transform] duration-150 " +
            (align === "right" ? "right-0" : "left-0")
          }
        >
          {items.map((item) => (
            <button
              key={item.key}
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className="block w-full rounded-[6px] px-2.5 py-1.5 text-left text-xs text-[var(--text)] transition-colors duration-150 hover:bg-[var(--bg-inset)] disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
