import { useEffect, useRef, useState } from "react";
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
  "tabular-nums min-w-0 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--bg-elevated)] px-2 h-9 text-xs text-[var(--text)] outline-none transition-colors duration-150 hover:border-[var(--border-strong)] focus-visible:border-[var(--accent)] focus-visible:shadow-[var(--focus-ring)] disabled:opacity-40";

/** Dimension input shown as whole feet + whole inches (0-11) for the "ft" unit; falls back to a plain decimal field otherwise. */
export function LengthField({ label, value, onChange, unit, min, max, disabled, className = "" }: LengthFieldProps) {
  const { feet, inches } = feetAndInches(value);
  const [feetText, setFeetText] = useState(String(feet));
  const [inchText, setInchText] = useState(String(inches));
  const cancelled = useRef(false);
  const originalText = useRef(`${feet}:${inches}`);

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
    let f = rawFeet.trim() ? Math.trunc(Number(rawFeet)) : Number.NaN;
    let i = rawInches.trim() ? Math.trunc(Number(rawInches)) : Number.NaN;
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
    if (Math.abs(total - value) > 1e-9) onChange(total);
    const norm = feetAndInches(total);
    setFeetText(String(norm.feet));
    setInchText(String(norm.inches));
  }

  function startEditing() { cancelled.current = false; originalText.current = `${feetText}:${inchText}`; }
  function commitDraft() { if (!cancelled.current && `${feetText}:${inchText}` !== originalText.current) commit(feetText, inchText); }
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation(); cancelled.current = true;
      setFeetText(String(feet)); setInchText(String(inches)); e.currentTarget.blur();
    } else if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-xs text-[var(--text-muted)]">{label}</span>}
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center">
          <input
            aria-label={`${label ?? "Length"} feet`}
            type="text"
            inputMode="numeric"
            value={feetText}
            disabled={disabled}
            onChange={(e) => setFeetText(e.target.value)}
            onFocus={startEditing}
            onBlur={commitDraft}
            onKeyDown={onKeyDown}
            className={inputClass}
          />
          <span className="ml-1 text-xs text-[var(--text-faint)]">ft</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center">
          <input
            aria-label={`${label ?? "Length"} inches`}
            type="text"
            inputMode="numeric"
            value={inchText}
            disabled={disabled}
            onChange={(e) => setInchText(e.target.value)}
            onFocus={startEditing}
            onBlur={commitDraft}
            onKeyDown={onKeyDown}
            className={inputClass}
          />
          <span className="ml-1 text-xs text-[var(--text-faint)]">in</span>
        </div>
      </div>
    </div>
  );
}
