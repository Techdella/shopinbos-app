import type { ComponentProps } from "react";
import type { AppPage, Tone } from "@/components/app-kit";

// Shared bits for the supplier portal pages (2026 app look): frame props, status wording and form field classes.

type FrameProps = ComponentProps<typeof AppPage>["frame"];

export function supplierFrame(
  user: { name: string; avatarUrl?: string | null; email?: string | null },
  supplier: { displayName: string; city?: string | null; country?: string | null; logoUrl?: string | null; verificationStatus?: string },
  extra: Partial<FrameProps> = {},
): FrameProps {
  const place = [supplier.city, supplier.country].filter(Boolean).join(" · ");
  return {
    role: "supplier",
    storeName: supplier.displayName,
    storeSlug: place || undefined,
    storeInitial: supplier.displayName.charAt(0).toUpperCase(),
    storeLogoUrl: supplier.logoUrl ?? null,
    userName: user.name,
    userInitials: initials(user.name),
    avatarUrl: user.avatarUrl ?? null,
    userEmail: user.email ?? null,
    ...extra,
  };
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").toUpperCase().slice(0, 2) || "·";
}

export function money(amount: number | null | undefined, currency = "NGN") {
  if (amount === null || amount === undefined) return "—";
  if (currency === "NGN") return `₦${Math.round(amount).toLocaleString("en-NG")}`;
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function shortDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function timeAgo(value: Date | string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? "Just now" : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return shortDate(value);
}

/** Short readable order reference from the id (orders have no number column). */
export function orderRef(id: string) {
  return `PO-${id.slice(-6).toUpperCase()}`;
}

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "New: accept it", tone: "accent" },
  confirmed: { label: "To pack", tone: "info" },
  processing: { label: "Packing", tone: "warning" },
  shipped: { label: "Sent", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "muted" },
  refunded: { label: "Refunded", tone: "danger" },
};

export const QUOTE_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting on you", tone: "accent" },
  responded: { label: "Quote sent", tone: "info" },
  accepted: { label: "Accepted", tone: "success" },
  rejected: { label: "Passed", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

export const PRODUCT_STATUS: Record<string, { label: string; tone: Tone }> = {
  published: { label: "Live", tone: "success" },
  pending_review: { label: "In review", tone: "warning" },
  draft: { label: "Draft", tone: "muted" },
  unpublished: { label: "Hidden", tone: "muted" },
  rejected: { label: "Needs changes", tone: "danger" },
};

export const VERIFICATION_LABEL: Record<string, string> = {
  unverified: "Not verified",
  pending: "Under review",
  verified: "Verified",
  rejected: "Needs changes",
  suspended: "Suspended",
};

export function statusOf<T extends { label: string; tone: Tone }>(map: Record<string, T>, status: string): { label: string; tone: Tone } {
  return map[status] ?? { label: status.replace(/_/g, " "), tone: "muted" };
}

/** Form field classes matching app-ui TextInput, for server-rendered forms. */
export const fieldClass =
  "min-h-[48px] w-full rounded-[14px] border border-app-line bg-white px-4 text-[15px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink disabled:bg-app-canvas disabled:text-app-ink-soft";
export const textareaClass =
  "w-full rounded-[14px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.5] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
export const labelClass = "mb-2 block text-[14px] font-bold text-app-ink";
export const hintClass = "mt-1.5 text-[12.5px] text-app-ink-soft";

/** Pill button classes for <button type="submit"> inside server forms. */
export const buttonClass = {
  ink: "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-55",
  accent: "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-app-accent px-5 text-[14px] font-extrabold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55",
  white: "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink transition hover:border-app-line-strong disabled:cursor-not-allowed disabled:opacity-55",
  smallInk: "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full bg-app-ink px-4 text-[13px] font-extrabold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-55",
  smallWhite: "inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold text-app-ink transition hover:border-app-line-strong disabled:cursor-not-allowed disabled:opacity-55",
} as const;
