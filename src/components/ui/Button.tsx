import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] font-medium " +
  "transition-[transform,background-color,border-color,color,opacity] duration-150 " +
  "active:translate-y-px active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] select-none whitespace-nowrap";

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
};

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-strong)] border border-transparent",
  secondary:
    "bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-inset)]",
  ghost: "bg-transparent text-[var(--text-muted)] border border-transparent hover:bg-[var(--bg-inset)] hover:text-[var(--text)]",
  danger: "bg-transparent text-[var(--danger)] border border-transparent hover:bg-[var(--danger-soft)]",
};

export function Button({ variant = "secondary", size = "md", icon, className = "", children, ...rest }: ButtonProps) {
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}
