import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { cn } from "@/lib/utils";

// Re-export so callers can use the type
export type { IconName };

export type BtnVariant = "primary" | "mint" | "outline" | "ghost" | "danger";
export type BtnSize    = "sm" | "md" | "lg";

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: string;
  iconLeft?: string;
  loading?: boolean;
  dark?: boolean;
}

// 2026 app look: pills; ink primary, orange accent ("mint" kept as the name older pages use).
const variants: Record<BtnVariant, string> = {
  primary: "bg-app-ink text-white hover:bg-black",
  mint:    "bg-app-accent text-white hover:brightness-95",
  outline: "bg-white border border-app-line text-app-ink hover:border-app-line-strong",
  ghost:   "bg-transparent text-app-ink hover:bg-black/[0.04]",
  danger:  "bg-app-danger text-white hover:opacity-90",
};

const sizes: Record<BtnSize, string> = {
  sm: "min-h-[34px] px-3.5 text-[13px] gap-1.5",
  md: "min-h-[42px] px-5 text-[14px] gap-2",
  lg: "min-h-[50px] px-6 text-[15px] gap-2",
};

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant = "primary", size = "md", icon, iconLeft, loading, dark, className, children, disabled, ...props }, ref) => {
    const isDark = dark && variant === "primary";
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-app font-extrabold",
          "leading-none tracking-[-0.005em] cursor-pointer transition-colors duration-150",
          "disabled:opacity-50 disabled:pointer-events-none",
          isDark ? "bg-app-accent text-white hover:brightness-95" : variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {iconLeft && <Icon name={iconLeft as any} size={size === "sm" ? 12 : 14} />}
        {loading ? <span className="animate-pulse-dot">···</span> : children}
        {icon && <Icon name={icon as any} size={size === "sm" ? 12 : 14} />}
      </button>
    );
  },
);
Btn.displayName = "Btn";
