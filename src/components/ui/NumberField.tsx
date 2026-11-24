import { useEffect, useRef, useState } from "react";

interface NumberFieldProps {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  className?: string;
}

export function NumberField({ label, value, onChange, step = 0.1, min, max, suffix, disabled, className = "" }: NumberFieldProps) {
  const [text, setText] = useState(formatNum(value));
  const cancelled = useRef(false);
  const originalText = useRef(text);

  useEffect(() => {
    setText(formatNum(value));
  }, [value]);

  function commit(raw: string) {
    const parsed = raw.trim() ? Number(raw) : Number.NaN;
    if (Number.isFinite(parsed)) {
      let v = parsed;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      if (v !== value) onChange(v);
      setText(formatNum(v));
    } else {
      setText(formatNum(value));
    }
  }

  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-xs text-[var(--text-muted)]">{label}</span>}
      <div className="flex items-center">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => { cancelled.current = false; originalText.current = text; }}
          onBlur={(e) => { if (!cancelled.current && e.target.value !== originalText.current) commit(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelled.current = true; setText(formatNum(value)); e.currentTarget.blur(); }
            else if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          }}
          step={step}
          aria-label={label ?? suffix ?? "Number"}
          className="tabular-nums min-w-0 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 h-9 text-xs text-[var(--text)] outline-none transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)] disabled:opacity-40"
        />
        {suffix && <span className="ml-1.5 text-xs text-[var(--text-faint)] tabular-nums">{suffix}</span>}
      </div>
    </label>
  );
}

function formatNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
