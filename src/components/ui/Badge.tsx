import type { HTMLAttributes, ReactNode } from "react";

type BadgeVariant =
  | "success" | "warn" | "danger" | "info"
  | "mint" | "soft" | "amber" | "berry" | "indigo" | "rose" | "lime" | "ink";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
}

const cls: Record<BadgeVariant, string> = {
  success: "badge-success",
  warn:    "badge-warn",
  danger:  "badge-danger",
  info:    "badge-info",
  mint:    "badge-mint",
  soft:    "badge-soft",
  amber:   "badge-amber",
  berry:   "badge-berry",
  indigo:  "badge-indigo",
  rose:    "badge-rose",
  lime:    "badge-lime",
  ink:     "badge-ink",
};

export function Badge({ variant = "soft", dot: showDot, className, children, ...props }: BadgeProps) {
  return (
    <span className={`badge ${cls[variant]}${className ? " " + className : ""}`} {...props}>
      {showDot && <span className="badge-dot" />}
      {children}
    </span>
  );
}
