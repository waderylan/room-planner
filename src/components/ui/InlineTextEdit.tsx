import { useEffect, useRef, useState } from "react";

interface InlineTextEditProps {
  value: string;
  onCommit: (v: string) => void;
  editing: boolean;
  onStopEditing: () => void;
  className?: string;
}

export function InlineTextEdit({ value, onCommit, editing, onStopEditing, className = "" }: InlineTextEditProps) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setText(value);
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.select();
      });
    }
  }, [editing, value]);

  if (!editing) return null;

  function commit() {
    const trimmed = text.trim();
    if (trimmed) onCommit(trimmed);
    onStopEditing();
  }

  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onStopEditing();
      }}
      className={`rounded-[var(--radius-control)] border border-[var(--accent)] bg-[var(--bg-elevated)] px-2 py-0.5 text-sm outline-none focus-visible:shadow-[var(--focus-ring)] ${className}`}
    />
  );
}
