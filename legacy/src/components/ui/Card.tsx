import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  accent?: string;
  padding?: "none" | "sm" | "md" | "lg";
  dark?: boolean;
}

const paddings = {
  none: "",
  sm:   "p-3",
  md:   "p-5",
  lg:   "p-6",
};

export function Card({ accent, padding = "md", dark, className, style, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border",
        dark
          ? "bg-navy border-mint/10 text-cream"
          : "bg-white border-navy/[0.06]",
        paddings[padding],
        className,
      )}
      style={{
        borderRadius: "var(--radius-lg)",
        borderTopWidth: accent ? "3px" : undefined,
        borderTopColor: accent ?? undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
