import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  dot?: boolean;
  dotColor?: string;
  color?: string;
  bg?: string;
}

export function Pill({ dot, dotColor, color, bg, className, style, children, ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill",
        "font-mono text-[11px] font-medium tracking-[0.04em]",
        className,
      )}
      style={{ background: bg ?? "var(--color-mint-pale)", color: color ?? "var(--color-teal-deep)", ...style }}
      {...props}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: dotColor ?? color ?? "var(--color-teal)" }}
        />
      )}
      {children}
    </span>
  );
}
