import { addonPrices, boostPrices, type PriceBook } from "./platform-pricing";
import type { PlanRole } from "./plans";

// Add-ons and boosts people buy on top of their plan (the October 2026 pricing): extra staff seats and SMS/WhatsApp
// packs for sellers, featured weeks for suppliers, their products and delivery partners. Prices come from Admin ›
// Pricing (shared/platform-pricing.ts). Server side: src/lib/plans/extras.server.ts.

export type ExtraKind = "staff_seat" | "sms_pack" | "whatsapp_pack" | "supplier_boost" | "product_boost" | "logistics_boost";

export const EXTRA_KINDS: readonly ExtraKind[] = ["staff_seat", "sms_pack", "whatsapp_pack", "supplier_boost", "product_boost", "logistics_boost"];

export const EXTRA_ROLE: Record<ExtraKind, PlanRole> = {
  staff_seat: "seller",
  sms_pack: "seller",
  whatsapp_pack: "seller",
  supplier_boost: "supplier",
  product_boost: "supplier",
  logistics_boost: "logistics_partner",
};

/** Messages in one SMS or WhatsApp pack. */
export const MESSAGES_PER_PACK = 500;
/** How long one staff seat lasts (a month), and one boost "unit" (a week). */
export const SEAT_DAYS = 30;
export const BOOST_DAYS = 7;
/** Most of one thing bought at once (seats, packs or weeks). */
export const MAX_EXTRA_QUANTITY = 12;
export const EXTRA_REFERENCE_PREFIX = "extras-";

export function isExtraKind(value: unknown): value is ExtraKind {
  return typeof value === "string" && (EXTRA_KINDS as readonly string[]).includes(value);
}

/** Price in naira of one unit (a seat-month, a pack, or a week). */
export function extraUnitPrice(book: PriceBook, kind: ExtraKind) {
  const addons = addonPrices(book);
  const boosts = boostPrices(book);
  switch (kind) {
    case "staff_seat": return addons.staffSeat;
    case "sms_pack": return addons.smsPack;
    case "whatsapp_pack": return addons.whatsappPack;
    case "supplier_boost": return boosts.supplierWeek;
    case "product_boost": return boosts.productWeek;
    case "logistics_boost": return boosts.logisticsStateWeek;
  }
}

/** Days one unit runs for, or null for packs (they last until used). */
export function extraUnitDays(kind: ExtraKind): number | null {
  if (kind === "staff_seat") return SEAT_DAYS;
  if (kind === "sms_pack" || kind === "whatsapp_pack") return null;
  return BOOST_DAYS;
}

/** Boosts need something to boost: a product (product_boost) or a state (logistics_boost). */
export function extraNeedsTarget(kind: ExtraKind) {
  return kind === "product_boost" || kind === "logistics_boost";
}

export function cleanExtraQuantity(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_EXTRA_QUANTITY ? n : null;
}

/**
 * When a new period starts and ends: right after the latest one still running for the same thing (so a second
 * purchase extends rather than overlaps), else now.
 */
export function extraWindow(kind: ExtraKind, quantity: number, latestEnd: Date | null, now: Date) {
  const days = extraUnitDays(kind);
  if (days === null) return { startsAt: null, endsAt: null };
  // Seats are bought side by side (two seats = two people this month); boosts queue up one after another.
  const startsAt = kind !== "staff_seat" && latestEnd && latestEnd > now ? latestEnd : now;
  const length = kind === "staff_seat" ? days : days * quantity;
  return { startsAt, endsAt: new Date(startsAt.getTime() + length * 86_400_000) };
}

/** Messages left this month: the plan's monthly messages not yet used, then pack messages. */
export function messagesLeft(includedMonthly: number, sentThisMonth: number, packBalance: number) {
  return Math.max(0, includedMonthly - sentThisMonth) + Math.max(0, packBalance);
}
