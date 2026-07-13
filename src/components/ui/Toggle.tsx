interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  "aria-label"?: string;
}

export function Toggle({ checked, onChange, label, ...rest }: ToggleProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={rest["aria-label"] ?? label}
        onClick={() => onChange(!checked)}
        className={
          "relative h-5 w-9 rounded-full border transition-colors duration-150 active:scale-[0.98] " +
          "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] " +
          (checked ? "bg-[var(--accent)] border-[var(--accent)]" : "bg-[var(--bg-inset)] border-[var(--border)]")
        }
      >
        <span
          className={
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 " +
            (checked ? "translate-x-[18px]" : "translate-x-0.5")
          }
        />
      </button>
      {label && <span className="text-xs text-[var(--text-muted)]">{label}</span>}
    </label>
  );
}
