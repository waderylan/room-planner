interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function Segmented<T extends string>({ options, value, onChange, className = "" }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] p-0.5 ${className}`}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={
              "h-7 rounded-[6px] px-3 text-xs font-medium transition-[transform,background-color,color] duration-150 " +
              "active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] " +
              (selected
                ? "bg-[var(--bg-elevated)] text-[var(--text)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
