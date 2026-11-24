import { useEffect, useRef, useState } from "react";

interface InlineTextEditProps {
  value: string;
  onCommit: (v: string) => void;
  editing: boolean;
  onStopEditing: () => void;
  className?: string;
  "aria-label"?: string;
}

export function InlineTextEdit({ value, onCommit, editing, onStopEditing, className = "", "aria-label": label }: InlineTextEditProps) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    if (editing) {
      finished.current = false;
      setText(value);
      const frame = requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.select();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [editing, value]);

  if (!editing) return null;

  function commit() {
    if (finished.current) return;
    finished.current = true;
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    onStopEditing();
  }

  return (
    <input
      ref={ref}
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finished.current = true; onStopEditing(); }
      }}
      className={`rounded-[var(--radius-control)] border border-[var(--accent)] bg-[var(--bg-elevated)] px-2 py-0.5 text-sm outline-none focus-visible:shadow-[var(--focus-ring)] ${className}`}
    />
  );
}
