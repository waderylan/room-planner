import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  active?: boolean;
  "aria-label": string;
}

export function IconButton({ icon, active, className = "", ...rest }: IconButtonProps) {
  return (
    <button
      className={
        "inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] border transition-[transform,background-color,border-color,color] duration-150 " +
        "active:translate-y-px active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none " +
        "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] " +
        (active
          ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
          : "bg-transparent border-transparent text-[var(--text-muted)] hover:bg-[var(--bg-inset)] hover:text-[var(--text)]") +
        ` ${className}`
      }
      {...rest}
    >
      {icon}
    </button>
  );
}
