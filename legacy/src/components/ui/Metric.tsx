import { cn } from "@/lib/utils";

interface MetricProps {
  label: string;
  value: string;
  delta?: string;
  sub?: string;
  dark?: boolean;
  className?: string;
}

export function Metric({ label, value, delta, sub, dark, className }: MetricProps) {
  const positive = delta?.startsWith("+");
  return (
    <div
      className={cn(
        "rounded-lg p-4 flex flex-col gap-1.5",
        dark
          ? "bg-mint/[0.06] border border-mint/[0.18] text-cream"
          : "bg-white border border-navy/[0.06] text-navy",
        className,
      )}
      style={{ borderRadius: "var(--radius-lg)" }}
    >
      <div
        className="font-mono text-[11px] tracking-[0.08em] uppercase"
        style={{ color: dark ? "var(--color-mint-soft)" : "var(--color-muted)", opacity: dark ? 0.8 : 1 }}
      >
        {label}
      </div>
      <div className="font-display text-[32px] font-medium tracking-[-0.025em] leading-none">
        {value}
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        {delta && (
          <span
            className="px-2 py-0.5 rounded-pill font-mono text-[10px] font-semibold"
            style={{
              background: positive ? "var(--color-mint-pale)" : "var(--color-rose)",
              color:      positive ? "var(--color-teal-deep)" : "var(--color-coral)",
            }}
          >
            {delta}
          </span>
        )}
        {sub && (
          <span style={{ color: dark ? "var(--color-mint-soft)" : "var(--color-muted)", opacity: dark ? 0.7 : 1 }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
