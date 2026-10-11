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
        "border",
        dark
          ? "bg-app-ink border-transparent text-white"
          : "bg-white border-app-line",
        paddings[padding],
        className,
      )}
      style={{
        borderRadius: 22,
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
