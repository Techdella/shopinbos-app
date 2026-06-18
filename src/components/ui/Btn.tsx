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

const variants: Record<BtnVariant, string> = {
  primary: "bg-navy text-mint hover:bg-ink",
  mint:    "bg-mint  text-navy hover:bg-mint-soft",
  outline: "bg-transparent border border-navy/[0.18] text-navy hover:bg-navy/[0.04]",
  ghost:   "bg-transparent text-navy hover:bg-navy/[0.04]",
  danger:  "bg-coral text-white hover:opacity-90",
};

const sizes: Record<BtnSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2.5 text-sm gap-2",
  lg: "px-5 py-3 text-sm gap-2",
};

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant = "primary", size = "md", icon, iconLeft, loading, dark, className, children, disabled, ...props }, ref) => {
    const isDark = dark && variant === "primary";
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-pill font-sans font-medium",
          "leading-none tracking-[-0.005em] cursor-pointer transition-colors duration-150",
          "disabled:opacity-50 disabled:pointer-events-none",
          isDark ? "bg-mint text-navy hover:bg-mint-soft" : variants[variant],
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
