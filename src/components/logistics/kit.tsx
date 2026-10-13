import type { ComponentProps, ReactNode } from "react";
import type { AppFrame } from "@/components/shell/AppFrame";
import { AppPage, Pill, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { amountToCollect } from "@/lib/labels";
import { naira } from "@shared/onboarding";

// Shared pieces for the Shopinbos Partners (logistics) portal, following the
// "Partners · web dispatch console" and "Partners · mobile" prototypes.

export { naira };

type FrameProps = Omit<ComponentProps<typeof AppFrame>, "children">;

export interface PartnerFrameInput {
  user: { name: string; avatarUrl?: string | null; email?: string | null };
  partner: { displayName: string; city?: string | null; logoUrl?: string | null; verificationStatus?: string };
}

export function partnerFrame({ user, partner }: PartnerFrameInput): FrameProps {
  return {
    role: "logistics_partner",
    storeName: partner.displayName,
    storeSlug: partner.city ? `${partner.city} · Partner` : "Delivery partner",
    storeInitial: partner.displayName.charAt(0).toUpperCase(),
    storeLogoUrl: partner.logoUrl ?? null,
    userName: user.name,
    userInitials: user.name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2),
    avatarUrl: user.avatarUrl ?? null,
    userEmail: user.email ?? null,
    verificationStatus: partner.verificationStatus,
  };
}

/** AppPage with the partner portal frame. */
export function PartnerPage({ frame, ...props }: { frame: PartnerFrameInput } & Omit<ComponentProps<typeof AppPage>, "frame">) {
  return <AppPage frame={partnerFrame(frame)} {...props} />;
}

/** "Saved" / error banner driven by the ?saved= and ?error= params the server actions redirect with. */
export function ActionNotice({ saved, error, savedText = "Saved." }: { saved?: string; error?: string; savedText?: string }) {
  if (error) return <div className="mb-4"><Notice tone="error">{error}</Notice></div>;
  if (saved) return <div className="mb-4"><Notice tone="success">{savedText}</Notice></div>;
  return null;
}

export type BookingStatusValue = "pending" | "confirmed" | "picked_up" | "in_transit" | "delivered" | "failed" | "cancelled";

export const BOOKING_STATUSES: BookingStatusValue[] = ["pending", "confirmed", "picked_up", "in_transit", "delivered", "failed", "cancelled"];
export const ACTIVE_STATUSES: BookingStatusValue[] = ["confirmed", "picked_up", "in_transit"];

const STAGE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "New request", tone: "accent" },
  confirmed: { label: "Accepted, waiting for pickup", tone: "warning" },
  picked_up: { label: "Picked up", tone: "info" },
  in_transit: { label: "Picked up, on the way", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Delivery failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export function bookingStage(status: string) {
  return STAGE[status] ?? { label: status.replace(/_/g, " "), tone: "muted" as Tone };
}

export function StatusPill({ status }: { status: string }) {
  const stage = bookingStage(status);
  return <Pill tone={stage.tone} dot>{stage.label}</Pill>;
}

const QUOTE_STAGE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for your price", tone: "accent" },
  responded: { label: "Quoted", tone: "info" },
  accepted: { label: "Won", tone: "success" },
  rejected: { label: "Declined", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

export function quoteStage(status: string) {
  return QUOTE_STAGE[status] ?? { label: status, tone: "muted" as Tone };
}

/** Short job id shown to people: "J-8836". */
export function jobId(id: string) {
  return `J-${id.slice(-6).toUpperCase()}`;
}

export interface PackageInfo {
  description?: string;
  weight?: number;
  fragile?: boolean;
  declaredValue?: number;
}

export function packageInfo(value: unknown): PackageInfo {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as PackageInfo) : {};
}

/** "Small bag · 0.4 kg · Fragile" from whatever the seller filled in. */
export function packageSummary(value: unknown) {
  const pkg = packageInfo(value);
  return [pkg.description, typeof pkg.weight === "number" ? `${pkg.weight} kg` : null, pkg.fragile ? "Fragile" : null].filter(Boolean).join(" · ") || "Package";
}

/** The route "Yaba → Ajah", shown the way the prototype does. */
export function Route({ from, to, className }: { from: string; to: string; className?: string }) {
  return (
    <span className={className}>
      <span className="font-extrabold">{from}</span>
      <span aria-label=" to " className="px-1 text-app-ink-soft">→</span>
      <span className="font-extrabold">{to}</span>
    </span>
  );
}

const LAGOS = "Africa/Lagos";

/** YYYY-MM-DD in Lagos time, for "today" comparisons. */
export function lagosDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function lagosTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: LAGOS, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

/**
 * A date the way people say it: "today", "yesterday", "Friday" for the last week, otherwise "12 Oct".
 * Pass `opts` to force an exact format.
 */
export function lagosDate(date: Date, opts?: Intl.DateTimeFormatOptions, now = new Date()) {
  if (!opts) {
    const dayMs = 24 * 60 * 60 * 1000;
    const diff = Math.round((Date.parse(lagosDay(now)) - Date.parse(lagosDay(date))) / dayMs);
    if (diff === 0) return "today";
    if (diff === 1) return "yesterday";
    if (diff === -1) return "tomorrow";
    if (diff > 1 && diff < 7) return new Intl.DateTimeFormat("en-GB", { timeZone: LAGOS, weekday: "long" }).format(date);
    opts = { day: "numeric", month: "short" };
  }
  return new Intl.DateTimeFormat("en-GB", { timeZone: LAGOS, ...opts }).format(date);
}

/** Start of today in Lagos (UTC+1, no daylight saving). */
export function lagosStartOfToday(now = new Date()) {
  const [y, m, d] = lagosDay(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 60 * 60 * 1000);
}

export function timeAgo(date: Date, now = new Date()) {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return lagosDate(date);
}

/** What the partner keeps from a booking: the stored net amount, or the fee less the platform fee. */
export function bookingNet(booking: { deliveryFee: number; platformFee: number; netAmount: number }) {
  return booking.netAmount || booking.deliveryFee - (booking.platformFee || 0);
}

export interface CodOrder {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  paymentMethod: string | null;
}

/**
 * Cash the rider collects for a linked store order: pay-on-delivery orders, plus orders still unpaid
 * (same rule the seller's labels use).
 */
export function cashToCollect(order: CodOrder | undefined | null) {
  if (!order) return 0;
  if (order.paymentMethod === "pay_on_delivery") return Math.max(0, Number(order.total) || 0);
  return amountToCollect({ status: order.status, total: Number(order.total) });
}

/** Label + value row inside a card. */
export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
      <span className="text-app-ink-soft">{label}</span>
      <span className="min-w-0 truncate text-right font-bold">{children}</span>
    </div>
  );
}

export const inputClass =
  "h-11 w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3.5 text-[15px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
export const textareaClass =
  "w-full min-w-0 rounded-[14px] border border-app-line bg-white px-3.5 py-2.5 text-[15px] leading-[1.5] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
export const labelClass = "mb-1.5 block text-[15px] font-bold text-app-ink";

const BUTTON = {
  ink: "bg-app-ink text-white hover:bg-black",
  accent: "bg-app-accent text-white hover:brightness-95",
  white: "border border-app-line bg-white text-app-ink hover:border-app-line-strong",
} as const;

/** Server-safe pill submit button for plain <form action={serverAction}> forms. */
export function SubmitButton({ tone = "ink", size = "md", children, className, ...props }: { tone?: keyof typeof BUTTON; size?: "sm" | "md" } & ComponentProps<"button">) {
  return (
    <button
      type="submit"
      className={[
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-extrabold transition disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" ? "min-h-[40px] px-4 text-[15px]" : "min-h-[44px] px-5 text-[15px]",
        BUTTON[tone],
        className ?? "",
      ].join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
