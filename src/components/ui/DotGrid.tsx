import { cn } from "@/lib/utils";

interface DotGridProps {
  variant?: "dark" | "light";
  className?: string;
}

export function DotGrid({ variant = "dark", className }: DotGridProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 pointer-events-none",
        variant === "dark" ? "dot-grid" : "dot-grid-light",
        className,
      )}
    />
  );
}
