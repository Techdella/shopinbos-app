// Can a seller trust a supplier with their customers' orders? Shared by the web app and the phone app. Pure (only
// the delivery geography it builds on), unit-tested in tests/supplier-trust.test.mjs:
//   - nearby: for now sellers only see suppliers close enough to visit, so they can check the stock themselves;
//   - the risk score: what Shopinbos knows about a supplier (verification, track record, money owed), as a number,
//     a level and the reasons, shown next to "Verified" / "Not verified yet";
//   - the Dropship agreement: before a seller lists a supplier's products, the seller calls the supplier, checks
//     the stock (a visit or a video call) and both of them accept the same agreement.

import { areaFromText, haversineMeters, normalizePlace, type LatLng } from "./delivery-geo.ts";

// ─── Nearby ───────────────────────────────────────────────────────────────────

/** How far a supplier can be and still show to a seller: a trip a seller can make to see the stock. */
export const NEARBY_KM = 50;

/** Where a business is, from its city and address ("Shop 12, Alaba, Ojo" → Ojo), or null when we don't know. */
export function placeOf(parts: Array<string | null | undefined>): (LatLng & { name: string }) | null {
  // Most specific first: the address names the area, the city may only name the state.
  for (const part of [...parts].reverse()) {
    const area = part ? areaFromText(part) : null;
    if (area) return { lat: area.lat, lng: area.lng, name: area.name };
  }
  return null;
}

export interface Nearness {
  /** Straight-line km between the two places, when both are known. */
  km: number | null;
  near: boolean;
  /** The supplier's area, for "Ikeja · 12 km away". */
  area: string | null;
}

/**
 * Whether a supplier is close to a seller: within NEARBY_KM when both places are known, else the same city by name.
 * A seller with no city set sees no supplier as near (they're asked to add their city).
 */
export function nearness(seller: { city?: string | null; address?: string | null }, supplier: { city?: string | null; address?: string | null }): Nearness {
  const a = placeOf([seller.city, seller.address]);
  const b = placeOf([supplier.city, supplier.address]);
  if (a && b) {
    const km = Math.round(haversineMeters(a, b) / 100) / 10;
    return { km, near: km <= NEARBY_KM, area: b.name };
  }
  const sellerCity = normalizePlace(seller.city ?? "");
  const supplierCity = normalizePlace(supplier.city ?? "");
  return { km: null, near: Boolean(sellerCity) && sellerCity === supplierCity, area: b?.name ?? (supplier.city?.trim() || null) };
}

/** The seller has a city we can measure from. */
export function sellerHasPlace(seller: { city?: string | null; address?: string | null }) {
  return Boolean(normalizePlace(seller.city ?? "") || normalizePlace(seller.address ?? ""));
}

// ─── Risk score ───────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";

/** Why a supplier is riskier: each is shown to the seller in plain words (i18n key trust.reason.<code>). */
export type RiskReason =
  | "not_verified"
  | "verification_pending"
  | "new_account"
  | "no_orders_yet"
  | "few_orders"
  | "low_rating"
  | "missed_orders"
  | "orders_not_sent"
  | "owes_money"
  | "no_return_policy"
  | "no_wallet";

export interface RiskInput {
  verificationStatus: string;
  createdAt: Date | string;
  /** Dropship and wholesale orders the supplier sent (shipped or delivered). */
  ordersSent: number;
  rating: number;
  ratingCount: number;
  /** New orders that ran out of time without an answer. */
  missedOrders: number;
  /** Orders paid at checkout that the supplier didn't send. */
  notSent: number;
  /** Money the supplier owes another business and is past its due date. */
  overdueKobo: number;
  hasReturnPolicy: boolean;
  /** Paid in the app through a Shopinbos Wallet (else shops pay them directly). */
  walletActive: boolean;
  now?: Date;
}

const WEIGHTS: Record<RiskReason, number> = {
  not_verified: 35,
  verification_pending: 25,
  new_account: 15,
  no_orders_yet: 15,
  few_orders: 5,
  low_rating: 15,
  missed_orders: 10,
  orders_not_sent: 15,
  owes_money: 30,
  no_return_policy: 5,
  no_wallet: 5,
};

/**
 * 0 (nothing we know of) to 100 (many warning signs), with the level and the reasons biggest first. It is a guide,
 * never a guarantee: the seller still calls the supplier and checks the stock before listing.
 */
export function supplierRisk(input: RiskInput): { score: number; level: RiskLevel; reasons: RiskReason[] } {
  const now = input.now ?? new Date();
  const ageDays = (now.getTime() - new Date(input.createdAt).getTime()) / (24 * 60 * 60 * 1000);
  const reasons: RiskReason[] = [];
  if (input.verificationStatus === "pending") reasons.push("verification_pending");
  else if (input.verificationStatus !== "verified") reasons.push("not_verified");
  if (input.overdueKobo > 0) reasons.push("owes_money");
  if (input.notSent >= 2) reasons.push("orders_not_sent");
  if (ageDays < 30) reasons.push("new_account");
  if (input.ordersSent === 0) reasons.push("no_orders_yet");
  else if (input.ordersSent < 5) reasons.push("few_orders");
  if (input.ratingCount >= 3 && input.rating < 3.5) reasons.push("low_rating");
  if (input.missedOrders >= 3) reasons.push("missed_orders");
  if (!input.hasReturnPolicy) reasons.push("no_return_policy");
  if (!input.walletActive) reasons.push("no_wallet");
  reasons.sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  const score = Math.min(100, reasons.reduce((sum, reason) => sum + WEIGHTS[reason], 0));
  return { score, level: score < 25 ? "low" : score < 55 ? "medium" : "high", reasons };
}

// ─── The Dropship agreement ───────────────────────────────────────────────────

/** Changes when the agreement's points change; both sides accept the version shown to them. */
export const AGREEMENT_VERSION = "2026-11";

/** How the seller saw the stock before listing. */
export const STOCK_CHECKS = ["visit", "video"] as const;
export type StockCheck = (typeof STOCK_CHECKS)[number];

export function isStockCheck(value: unknown): value is StockCheck {
  return typeof value === "string" && (STOCK_CHECKS as readonly string[]).includes(value);
}

/** The points both sides accept (i18n keys agreement.point.<n>), in order. */
export const AGREEMENT_POINTS = 7;

export type AgreementStatus = "requested" | "active" | "declined";

/** What the seller can do about listing this supplier's products, from the agreement between them (or none). */
export function listingStep(agreement: { status: string } | null): "agree" | "waiting" | "declined" | "ready" {
  if (!agreement) return "agree";
  if (agreement.status === "active") return "ready";
  if (agreement.status === "requested") return "waiting";
  return "declined";
}
