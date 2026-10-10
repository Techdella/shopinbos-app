import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

interface TopBarProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function TopBar({ eyebrow, title, subtitle, actions }: TopBarProps) {
  return (
    <header
      className="flex items-end justify-between gap-6 px-8 pt-5 pb-4 shrink-0"
      style={{ borderBottom: "1px solid rgb(14 42 56 / 0.06)", background: "var(--color-paper)" }}
    >
      <div>
        {eyebrow && (
          <div className="font-mono text-[11px] tracking-[0.16em] uppercase mb-1.5"
            style={{ color: "var(--color-teal-deep)" }}>
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-[30px] font-medium tracking-[-0.025em] leading-none m-0"
          style={{ color: "var(--color-navy)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-1 m-0" style={{ color: "var(--color-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {actions}
      </div>
    </header>
  );
}
