import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClassName?: string;
}

export function Dialog({ open, onClose, title, children, footer, maxWidthClassName = "max-w-sm" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key !== "Tab") return;
        const focusable = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || !e.currentTarget.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !e.currentTarget.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose();
      }}
      className={`fixed inset-0 m-auto max-h-[min(85dvh,780px)] w-[calc(100%-2rem)] ${maxWidthClassName} overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-0 text-[var(--text)] shadow-[var(--shadow-md)] backdrop:bg-black/45 backdrop:backdrop-blur-[3px]`}
    >
      <div className="flex max-h-[min(85dvh,780px)] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <h2 id={titleId} className="text-sm font-semibold tracking-tight">{title}</h2>
          <button type="button" aria-label={`Close ${title}`} onClick={onClose} className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-inset)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"><X size={16} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 text-sm text-[var(--text-muted)]">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-5 py-4">{footer}</div>}
      </div>
    </dialog>,
    document.body,
  );
}
