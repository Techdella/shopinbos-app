import type { ReactNode } from "react";
import { cx } from "@/components/app-ui/cx";
import { intlLocale, type Locale } from "@shared/i18n";

// Form and chart pieces shared by the seller marketing, money and reports pages (2026 app look).
// Server-safe: plain elements and class strings, so server-action forms can use them without JavaScript.

export const inputClass =
  "h-[48px] w-full min-w-0 rounded-[14px] border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
export const selectClass =
  "h-[48px] w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3.5 text-[15px] text-app-ink outline-none transition focus:border-app-ink";
export const textareaClass =
  "w-full min-w-0 rounded-[14px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.5] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
export const checkClass = "h-[18px] w-[18px] shrink-0 accent-[#16141F]";

const BUTTON_TONE = {
  ink: "bg-app-ink text-white hover:bg-black",
  accent: "bg-app-accent text-white hover:brightness-95",
  white: "border border-app-line bg-white text-app-ink hover:border-app-line-strong",
  danger: "border border-app-line bg-white text-app-danger hover:border-app-danger",
  ghost: "bg-transparent text-app-ink hover:bg-black/[0.04]",
} as const;

/** Pill button classes for <button> and <a> elements that aren't PillButton/PillLink. */
export function buttonClass(tone: keyof typeof BUTTON_TONE = "ink", size: "sm" | "md" = "md", className?: string) {
  return cx(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-extrabold no-underline transition disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-ink",
    size === "sm" ? "min-h-[40px] px-4 text-[13px]" : "min-h-[44px] px-5 text-[14px]",
    BUTTON_TONE[tone],
    className,
  );
}

/** Label above a control, with an optional hint underneath. */
export function Field({ label, htmlFor, hint, children, className }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13.5px] font-bold text-app-ink">{label}</label>
      {children}
      {hint && <p className="mb-0 mt-1.5 text-[12.5px] leading-[1.45] text-app-ink-soft">{hint}</p>}
    </div>
  );
}

/** Label/value rows inside a card ("Opens 120 · 32%"). */
export function DetailList({ rows, className }: { rows: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cx("m-0 divide-y divide-app-line", className)}>
      {rows.map(([label, value], index) => (
        <div key={index} className="flex min-h-[42px] items-center justify-between gap-3 py-2 text-[14px]">
          <dt className="text-app-ink-soft">{label}</dt>
          <dd className="m-0 min-w-0 truncate text-right font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small boxed number used inside cards ("Delivered sales ₦84,000"). */
export function MiniStat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[14px] bg-app-canvas px-3.5 py-2.5">
      <div className="truncate text-[12.5px] text-app-ink-soft">{label}</div>
      <div className="mt-0.5 truncate text-[17px] font-extrabold">{value}</div>
      {hint && <div className="truncate text-[12px] text-app-ink-soft">{hint}</div>}
    </div>
  );
}

/**
 * Bar chart in the seller home style: one bar per value, the last one (today/this month) in orange,
 * the rest ink or grey. Every bar carries its value as a tooltip and the whole chart has a text summary.
 */
export function Bars({
  values,
  labels,
  summary,
  format = (value) => value.toLocaleString("en-NG"),
  height = 180,
  highlightLast = true,
  recent,
}: {
  values: number[];
  /** One label per bar; empty strings are skipped on the axis. */
  labels: string[];
  /** Screen-reader description of what the chart shows. */
  summary: string;
  format?: (value: number) => string;
  height?: number;
  highlightLast?: boolean;
  /** How many trailing bars are drawn in ink (the rest are grey). Defaults to all. */
  recent?: number;
}) {
  const max = Math.max(1, ...values);
  const firstInk = recent === undefined ? 0 : values.length - recent;
  const axis = labels.map((label, index) => ({ label, index })).filter((item) => item.label);
  return (
    <figure className="m-0">
      <div className="flex items-end gap-1 sm:gap-2" style={{ height }} role="img" aria-label={summary}>
        {values.map((value, index) => {
          const last = highlightLast && index === values.length - 1;
          return (
            <div
              key={index}
              title={`${labels[index] ? `${labels[index]}: ` : ""}${format(value)}`}
              className={cx("min-w-0 flex-1 rounded-[8px] sm:rounded-[10px]", last ? "bg-app-accent" : index >= firstInk && value > 0 ? "bg-app-ink" : "bg-app-track")}
              style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
            />
          );
        })}
      </div>
      {axis.length > 0 && (
        <figcaption className="mt-2 flex justify-between gap-2 text-[12px] text-app-ink-soft">
          {axis.length > 2 ? (
            <>
              <span>{axis[0].label}</span>
              <span className="hidden sm:inline">{axis[Math.floor(axis.length / 2)].label}</span>
              <span>{axis[axis.length - 1].label}</span>
            </>
          ) : (
            axis.map((item) => <span key={item.index}>{item.label}</span>)
          )}
        </figcaption>
      )}
    </figure>
  );
}

/** Horizontal share bar with a label and value ("WhatsApp · 22 orders"). */
export function ShareBar({ label, value, share, tone = "ink" }: { label: ReactNode; value: ReactNode; share: number; tone?: "ink" | "accent" | "success" }) {
  return (
    <div>
      <div className="flex justify-between gap-3 text-[14px]">
        <span className="min-w-0 truncate font-bold">{label}</span>
        <span className="shrink-0 text-app-ink-soft">{value}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas">
        <div
          className={cx("h-full rounded-full", tone === "accent" ? "bg-app-accent" : tone === "success" ? "bg-app-success" : "bg-app-ink")}
          style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** "13 Oct 2026" in Lagos time; pass the locale (and the translated "Not set") on translated screens. */
export function formatDate(value: Date | string | null | undefined, withTime = false, locale: Locale = "en", notSet = "Not set") {
  if (!value) return notSet;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : intlLocale(locale), {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

/** "order_created" → "Order created". */
export function humanize(value: string) {
  const text = value.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
