import type { ReactNode } from "react";
import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [position, setPosition] = useState({ left: 0, top: 0 });

  function focusTrigger() { ref.current?.querySelector<HTMLButtonElement>("button")?.focus(); }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("pointerdown", onDown); cancelAnimationFrame(frame); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !ref.current || !menuRef.current) return;
    const triggerBounds = ref.current.getBoundingClientRect();
    const menuBounds = menuRef.current.getBoundingClientRect();
    const left = align === "right" ? triggerBounds.right - menuBounds.width : triggerBounds.left;
    const below = triggerBounds.bottom + 6;
    setPosition({
      left: Math.max(8, Math.min(left, window.innerWidth - menuBounds.width - 8)),
      top: below + menuBounds.height > window.innerHeight - 8 ? Math.max(8, triggerBounds.top - menuBounds.height - 6) : below,
    });
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [open, align]);

  const accessibleTrigger = isValidElement<Record<string, unknown>>(trigger) ? cloneElement(trigger, {
    "aria-haspopup": "menu", "aria-expanded": open, "aria-controls": open ? menuId : undefined,
  }) : trigger;

  return (
    <div className="relative inline-block" ref={ref} onKeyDown={(e) => {
      if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); focusTrigger(); }
      if (e.key === "Tab") setOpen(false);
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) { e.preventDefault(); setOpen(true); }
    }}>
      <div onClick={() => setOpen((current) => !current)}>{accessibleTrigger}</div>
      {open && items.length > 0 && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", left: position.left, top: position.top }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); focusTrigger(); return; }
            if (e.key === "Tab") { setOpen(false); focusTrigger(); return; }
            const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
            if (!buttons.length) return;
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            let next = current;
            if (e.key === "ArrowDown") next = (current + 1) % buttons.length;
            else if (e.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = buttons.length - 1;
            else return;
            e.preventDefault(); e.stopPropagation(); buttons[next]?.focus();
          }}
          className="z-[60] min-w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 shadow-[var(--shadow-md)]"
        >
          {items.map((item) => (
            <button key={item.key} role="menuitem" tabIndex={-1} disabled={item.disabled} onClick={(e) => { e.stopPropagation(); setOpen(false); focusTrigger(); item.onSelect(); }} className="block w-full rounded-md px-3 py-2 text-left text-xs text-[var(--text)] transition-colors hover:bg-[var(--bg-inset)] focus:bg-[var(--bg-inset)] focus:outline-none disabled:pointer-events-none disabled:opacity-40">
              {item.label}
            </button>
          ))}
        </div>, document.body
      )}
    </div>
  );
}
