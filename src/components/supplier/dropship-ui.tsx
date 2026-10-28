import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "@/components/app-ui/cx";

// Controls of the 2026 supplier & dropship boards (P-Pricing, P-Dropship, P-Delivery, P-Branding, P-Order, P-Tier),
// shared by the web screens. Server-safe (no hooks): every control is a real <input> so plain server forms post it,
// and the selected look comes from CSS (`has-[:checked]`, `peer-checked`), so uncontrolled inputs style themselves.

/** A white board card (`.ch`): 20px corners, no border, on the canvas. */
export function BoardCard({ className, children, as: Tag = "div", locked = false, role, labelledBy }: { className?: string; children: ReactNode; as?: "div" | "section" | "li"; locked?: boolean; role?: "group" | "radiogroup"; labelledBy?: string }) {
  return (
    <Tag role={role} aria-labelledby={labelledBy} className={cx("m-0 min-w-0 rounded-[20px] p-4", locked ? "border-2 border-dashed border-app-locked bg-app-line-soft" : "border-0 bg-white", className)}>
      {children}
    </Tag>
  );
}

/** A question on a board card (`.q`): Bricolage 17px, with an optional grey line under it (`.qs`). */
export function BoardQuestion({ children, sub, id, as: Tag = "p" }: { children: ReactNode; sub?: ReactNode; id?: string; as?: "p" | "h2" | "h3" }) {
  return (
    <>
      <Tag id={id} className="m-0 p-0 font-app-display text-[17px] font-extrabold leading-[1.25] tracking-[-0.01em]">{children}</Tag>
      {sub ? <p className="m-0 -mt-1 text-[13px] text-app-ink-soft">{sub}</p> : null}
    </>
  );
}

/** A chip that is a radio (or checkbox): 2px grey ring, ink when picked (`.chip` / `.chip.sel`). */
export function ChipChoice({ label, size = "md", className, ...input }: { label: ReactNode; size?: "sm" | "md" } & Omit<InputHTMLAttributes<HTMLInputElement>, "size">) {
  return (
    <label
      className={cx(
        "inline-flex max-w-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-app-line bg-white font-bold text-app-ink transition hover:border-app-line-strong",
        "has-[:checked]:border-app-ink has-[:checked]:bg-app-ink has-[:checked]:text-white",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-accent has-[:focus-visible]:ring-offset-2",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        size === "sm" ? "min-h-[36px] px-3 text-[13px]" : "min-h-[42px] px-3.5 text-[14px]",
        className,
      )}
    >
      <input type="radio" className="sr-only" {...input} />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

/** Wrapping row of chips (`.chips`). */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-wrap gap-2", className)}>{children}</div>;
}

/**
 * An on/off switch (`.tg`): orange when on, grey when off. A real checkbox with role="switch" inside the label, so it
 * posts like any checkbox; put the visible words in `children` (they label it).
 */
export function SwitchRow({ children, className, icon, aside, ...input }: { children: ReactNode; className?: string; icon?: ReactNode; aside?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role">) {
  return (
    <label className={cx("flex min-h-[44px] items-center gap-3", input.disabled ? "cursor-not-allowed" : "cursor-pointer", className)}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      {aside}
      <input type="checkbox" role="switch" className="peer sr-only" {...input} />
      <span
        aria-hidden
        className={cx(
          "relative h-[30px] w-[50px] shrink-0 rounded-full bg-app-locked transition",
          "after:absolute after:left-[3px] after:top-[3px] after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow-[0_1px_2px_rgba(22,20,31,0.18)] after:transition-transform",
          "peer-checked:bg-app-accent peer-checked:after:translate-x-5",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-app-ink peer-focus-visible:ring-offset-2 peer-disabled:opacity-50",
        )}
      />
    </label>
  );
}

/** Title and grey line of a row (`.in` / `.is`). */
export function RowText({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <span className="block text-[15px] font-extrabold leading-[1.3]">{title}</span>
      {sub ? <span className="mt-0.5 block text-[12.5px] leading-[1.4] text-app-ink-soft">{sub}</span> : null}
    </>
  );
}

/** A round icon tile (`.ic`) on a soft colour. */
export function IconTile({ children, className }: { children: ReactNode; className?: string }) {
  return <span aria-hidden className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-ink", className)}>{children}</span>;
}

/** A progress meter (`.meter`): orange for suppliers, forest for delivery partners. */
export function Meter({ have, need, label, tone = "accent", track = "line" }: { have: number; need: number; label: string; tone?: "accent" | "forest" | "success"; track?: "line" | "locked" }) {
  const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 0;
  return (
    <div className={cx("h-2 overflow-hidden rounded-full", track === "locked" ? "bg-[#E2DFEA]" : "bg-app-line")} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={need} aria-valuenow={Math.min(have, need)}>
      <div className={cx("h-full rounded-full", tone === "forest" ? "bg-app-forest" : tone === "success" ? "bg-app-success" : "bg-app-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** "ALWAYS ON" and similar small caps pills. */
export function CapsPill({ children, tone = "success" }: { children: ReactNode; tone?: "success" | "muted" | "sun" }) {
  return (
    <span className={cx("shrink-0 rounded-full px-2 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.05em]", tone === "success" ? "bg-app-success-tint text-app-success" : tone === "sun" ? "bg-app-sun text-app-ink" : "bg-white text-app-ink-soft")}>
      {children}
    </span>
  );
}

/** A coloured dot before a channel name (`.dot`). */
export function Dot({ className }: { className: string }) {
  return <span aria-hidden className={cx("h-2.5 w-2.5 shrink-0 rounded-full", className)} />;
}

/** A naira box (`.price`): 2px grey ring, big Bricolage figure, a small grey word on the left or right. */
export const priceBoxClass =
  "flex h-12 min-w-0 items-center gap-1.5 rounded-[14px] border-2 border-app-line bg-white px-3.5 transition focus-within:border-app-ink";
export const priceInputClass =
  "min-w-0 flex-1 bg-transparent font-app-display text-[20px] font-extrabold text-app-ink outline-none placeholder:font-app placeholder:text-[15px] placeholder:font-bold placeholder:text-app-ink-faint [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
