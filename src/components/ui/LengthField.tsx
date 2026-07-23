import { useEffect, useState } from "react";
import { feetAndInches, feetInchesToFeet } from "../../format/length";
import { NumberField } from "./NumberField";

interface LengthFieldProps {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
}

const inputClass =
  "tabular-nums w-11 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 h-8 text-sm text-[var(--text)] outline-none transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)] disabled:opacity-40";

/** Dimension input shown as whole feet + whole inches (0-11) for the "ft" unit; falls back to a plain decimal field otherwise. */
export function LengthField({ label, value, onChange, unit, min, max, disabled, className = "" }: LengthFieldProps) {
  const { feet, inches } = feetAndInches(value);
  const [feetText, setFeetText] = useState(String(feet));
  const [inchText, setInchText] = useState(String(inches));

  useEffect(() => {
    const fi = feetAndInches(value);
    setFeetText(String(fi.feet));
    setInchText(String(fi.inches));
  }, [value]);

  if (unit !== "ft") {
    return (
      <NumberField label={label} value={value} onChange={onChange} suffix={unit} step={0.01} min={min} max={max} disabled={disabled} className={className} />
    );
  }

  function commit(rawFeet: string, rawInches: string) {
    let f = Math.trunc(Number(rawFeet));
    let i = Math.trunc(Number(rawInches));
    if (!Number.isFinite(f)) f = feet;
    if (!Number.isFinite(i)) i = inches;
    if (i >= 12) {
      f += Math.floor(i / 12);
      i = i % 12;
    } else if (i < 0) {
      const borrow = Math.ceil(-i / 12);
      f -= borrow;
      i += borrow * 12;
    }
    let total = feetInchesToFeet(f, i);
    if (min !== undefined) total = Math.max(min, total);
    if (max !== undefined) total = Math.min(max, total);
    onChange(total);
    const norm = feetAndInches(total);
    setFeetText(String(norm.feet));
    setInchText(String(norm.inches));
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-xs text-[var(--text-muted)]">{label}</span>}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center">
          <input
            type="text"
            inputMode="numeric"
            value={feetText}
            disabled={disabled}
            onChange={(e) => setFeetText(e.target.value)}
            onBlur={() => commit(feetText, inchText)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className={inputClass}
          />
          <span className="ml-1 text-xs text-[var(--text-faint)]">ft</span>
        </div>
        <div className="flex items-center">
          <input
            type="text"
            inputMode="numeric"
            value={inchText}
            disabled={disabled}
            onChange={(e) => setInchText(e.target.value)}
            onBlur={() => commit(feetText, inchText)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className={inputClass}
          />
          <span className="ml-1 text-xs text-[var(--text-faint)]">in</span>
        </div>
      </div>
    </div>
  );
}
