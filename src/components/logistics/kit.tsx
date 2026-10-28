import type { ComponentProps, ReactNode } from "react";
import type { AppFrame } from "@/components/shell/AppFrame";
import { AppPage, Pill, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { amountToCollect } from "@/lib/labels";
import { naira } from "@shared/onboarding";
import { intlLocale, type TFunction } from "@shared/i18n";
import type { KeysOf } from "@shared/i18n/catalog";
import { getT } from "@/lib/i18n/server";
import { jobErrorWords } from "./job-errors";

// Shared pieces for the Shopinbos Partners (logistics) portal, following the
// "Partners · web dispatch console" and "Partners · mobile" prototypes.

export { naira };

/**
 * Any translate function (pages pass `await getT("logistics", "common")`). The kit's words live in the
 * "logistics" namespace and are looked up with t.dynamic, so any page's t works. Without one, English.
 */
export type Translate = Pick<TFunction, "dynamic" | "locale">;
/** The partner pages' translate function, for helper components that take it as a prop. */
export type LogisticsT = TFunction<KeysOf<["logistics", "common"]>>;

/** The Intl tag for dates: en-GB for English (as before), else the language's own. */
function dateTag(t?: Translate) {
  return !t || t.locale === "en" ? "en-GB" : intlLocale(t.locale);
}

type FrameProps = Omit<ComponentProps<typeof AppFrame>, "children">;

export interface PartnerFrameInput {
  user: { name: string; avatarUrl?: string | null; email?: string | null };
  partner: { displayName: string; city?: string | null; logoUrl?: string | null; verificationStatus?: string; kycSubmittedAt?: Date | null };
}

/**
 * The status the portal's verification banner shows. A new partner's verificationStatus starts as "pending" before
 * anything is sent, so "pending" without a submission (kycSubmittedAt, shared/partner-tiers.ts) reads as not sent yet.
 */
export function bannerStatus(partner: PartnerFrameInput["partner"]) {
  if (partner.verificationStatus === "pending" && "kycSubmittedAt" in partner && !partner.kycSubmittedAt) return "unverified";
  return partner.verificationStatus;
}

export function partnerFrame({ user, partner }: PartnerFrameInput, t?: Translate): FrameProps {
  return {
    role: "logistics_partner",
    storeName: partner.displayName,
    storeSlug: partner.city
      ? t ? t.dynamic("kit.cityPartner", "{city} · Partner", { city: partner.city }) : `${partner.city} · Partner`
      : t ? t.dynamic("kit.deliveryPartner", "Delivery partner") : "Delivery partner",
    storeInitial: partner.displayName.charAt(0).toUpperCase(),
    storeLogoUrl: partner.logoUrl ?? null,
    userName: user.name,
    userInitials: user.name.split(" ").map((part) => part[0]).join("").toUpperCase().slice(0, 2),
    avatarUrl: user.avatarUrl ?? null,
    userEmail: user.email ?? null,
    verificationStatus: bannerStatus(partner),
  };
}

/** AppPage with the partner portal frame. */
export async function PartnerPage({ frame, ...props }: { frame: PartnerFrameInput } & Omit<ComponentProps<typeof AppPage>, "frame">) {
  const t = await getT("logistics");
  return <AppPage frame={partnerFrame(frame, t)} {...props} />;
}

/** "Saved" / error banner driven by the ?saved= and ?error= params the server actions redirect with. */
export async function ActionNotice({ saved, error, savedText }: { saved?: string; error?: string; savedText?: string }) {
  if (error) return <div className="mb-4"><Notice tone="error">{jobErrorWords(await getT("logistics"), error)}</Notice></div>;
  if (saved) return <div className="mb-4"><Notice tone="success">{savedText ?? (await getT("logistics"))("kit.saved")}</Notice></div>;
  return null;
}

export type BookingStatusValue =
  | "pending" | "confirmed" | "picked_up" | "in_transit" | "delivered" | "failed" | "cancelled"
  // Logistics marketplace (src/lib/logistics/job-rules.ts).
  | "declined" | "out_for_delivery" | "at_pickup_point" | "returning" | "returned";

export const BOOKING_STATUSES: BookingStatusValue[] = [
  "pending", "confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "delivered", "failed", "returning", "returned", "declined", "cancelled",
];
/** Jobs a partner is carrying now (accepted and not finished). */
export const ACTIVE_STATUSES: BookingStatusValue[] = ["confirmed", "picked_up", "in_transit", "out_for_delivery", "at_pickup_point", "returning"];
/** Jobs a rider has on the road (the Riders app and "who's carrying what"). */
export const ON_ROAD_STATUSES: BookingStatusValue[] = ["confirmed", "picked_up", "in_transit", "out_for_delivery"];

const STAGE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "New request", tone: "accent" },
  confirmed: { label: "Accepted, waiting for pickup", tone: "warning" },
  picked_up: { label: "Picked up", tone: "info" },
  in_transit: { label: "Picked up, on the way", tone: "info" },
  out_for_delivery: { label: "Out for delivery", tone: "info" },
  at_pickup_point: { label: "At pickup point", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  failed: { label: "Delivery failed", tone: "danger" },
  returning: { label: "Returning to sender", tone: "warning" },
  returned: { label: "Returned", tone: "muted" },
  declined: { label: "Declined", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export function bookingStage(status: string, t?: Translate) {
  const stage = STAGE[status];
  if (!stage) return { label: status.replace(/_/g, " "), tone: "muted" as Tone };
  return t ? { label: t.dynamic(`stage.${status}`, stage.label), tone: stage.tone } : stage;
}

export async function StatusPill({ status }: { status: string }) {
  const stage = bookingStage(status, await getT("logistics"));
  return <Pill tone={stage.tone} dot>{stage.label}</Pill>;
}

const QUOTE_STAGE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for your price", tone: "accent" },
  responded: { label: "Quoted", tone: "info" },
  accepted: { label: "Won", tone: "success" },
  rejected: { label: "Declined", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

export function quoteStage(status: string, t?: Translate) {
  const stage = QUOTE_STAGE[status];
  if (!stage) return { label: status, tone: "muted" as Tone };
  return t ? { label: t.dynamic(`quoteStage.${status}`, stage.label), tone: stage.tone } : stage;
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
export function packageSummary(value: unknown, t?: Translate) {
  const pkg = packageInfo(value);
  const fragile = pkg.fragile ? (t ? t.dynamic("kit.fragile", "Fragile") : "Fragile") : null;
  return [pkg.description, typeof pkg.weight === "number" ? `${pkg.weight} kg` : null, fragile].filter(Boolean).join(" · ") || (t ? t.dynamic("kit.package", "Package") : "Package");
}

/** The route "Yaba → Ajah", shown the way the prototype does. */
export function Route({ from, to, className, toLabel = " to " }: { from: string; to: string; className?: string; toLabel?: string }) {
  return (
    <span className={className}>
      <span className="font-extrabold">{from}</span>
      <span aria-label={toLabel} className="px-1 text-app-ink-soft">→</span>
      <span className="font-extrabold">{to}</span>
    </span>
  );
}

const LAGOS = "Africa/Lagos";

/** YYYY-MM-DD in Lagos time, for "today" comparisons. */
export function lagosDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function lagosTime(date: Date, t?: Translate) {
  return new Intl.DateTimeFormat(dateTag(t), { timeZone: LAGOS, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

/**
 * A date the way people say it: "today", "yesterday", "Friday" for the last week, otherwise "12 Oct".
 * Pass `opts` to force an exact format.
 */
export function lagosDate(date: Date, opts?: Intl.DateTimeFormatOptions, now = new Date(), t?: Translate) {
  if (!opts) {
    const dayMs = 24 * 60 * 60 * 1000;
    const diff = Math.round((Date.parse(lagosDay(now)) - Date.parse(lagosDay(date))) / dayMs);
    if (diff === 0) return t ? t.dynamic("kit.today", "today") : "today";
    if (diff === 1) return t ? t.dynamic("kit.yesterday", "yesterday") : "yesterday";
    if (diff === -1) return t ? t.dynamic("kit.tomorrow", "tomorrow") : "tomorrow";
    if (diff > 1 && diff < 7) return new Intl.DateTimeFormat(dateTag(t), { timeZone: LAGOS, weekday: "long" }).format(date);
    opts = { day: "numeric", month: "short" };
  }
  return new Intl.DateTimeFormat(dateTag(t), { timeZone: LAGOS, ...opts }).format(date);
}

/** Start of today in Lagos (UTC+1, no daylight saving). */
export function lagosStartOfToday(now = new Date()) {
  const [y, m, d] = lagosDay(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 60 * 60 * 1000);
}

export function timeAgo(date: Date, now = new Date(), t?: Translate) {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) return t ? t.dynamic("kit.justNow", "just now") : "just now";
  if (minutes < 60) return t ? t.dynamic("kit.minAgo", "{count} min ago", { count: minutes }) : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t ? t.dynamic("kit.hoursAgo", "{count} h ago", { count: hours }) : `${hours} h ago`;
  return lagosDate(date, undefined, now, t);
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
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold transition disabled:cursor-not-allowed disabled:opacity-55",
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
