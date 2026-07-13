import type { ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
}

export function Dialog({ open, onClose, title, children, footer, maxWidthClassName = "max-w-sm" }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`w-full ${maxWidthClassName} rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-md)] transition-[opacity,transform] duration-150`}
      >
        <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">{title}</h2>
        <div className="text-sm text-[var(--text-muted)]">{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
