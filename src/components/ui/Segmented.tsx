interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  "aria-label"?: string;
}

export function Segmented<T extends string>({ options, value, onChange, className = "", "aria-label": label }: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label ?? options.map((option) => option.label).join(" / ")}
      className={`inline-flex items-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-inset)] p-0.5 ${className}`}
    >
      {options.map((opt, index) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => {
              let next = index;
              if (e.key === "ArrowRight") next = (index + 1) % options.length;
              else if (e.key === "ArrowLeft") next = (index - 1 + options.length) % options.length;
              else if (e.key === "Home") next = 0;
              else if (e.key === "End") next = options.length - 1;
              else return;
              e.preventDefault();
              onChange(options[next].value);
              (e.currentTarget.parentElement?.querySelectorAll("button")[next] as HTMLButtonElement | undefined)?.focus();
            }}
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
