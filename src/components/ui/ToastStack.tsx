import { useStore } from "../../store/store";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";

const ICONS = {
  success: CheckCircle,
  error: WarningCircle,
  info: Info,
};

const COLORS = {
  success: "text-[var(--accent)]",
  error: "text-[var(--danger)]",
  info: "text-[var(--text-muted)]",
};

export function ToastStack() {
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.variant];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] shadow-[var(--shadow-md)] transition-[opacity,transform] duration-150"
          >
            <Icon size={16} weight="bold" className={COLORS[t.variant]} />
            <span>{t.message}</span>
            <button
              aria-label="Dismiss"
              onClick={() => dismissToast(t.id)}
              className="ml-1 rounded p-0.5 text-[var(--text-faint)] transition-colors duration-150 hover:text-[var(--text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
