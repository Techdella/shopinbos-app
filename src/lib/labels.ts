// Shipping labels and packing slips (/home/labels). Pure helpers, unit-tested.

import { parseNgPostcode } from "../../shared/ng-postcode.ts";

export const LABEL_FORMATS = [
  { key: "label", label: "Label printer (4 × 6 in)", hint: "One label per sticker, for thermal printers." },
  { key: "a4", label: "A4 paper (4 per page)", hint: "Any printer. Cut along the lines and tape on." },
] as const;
export type LabelFormat = (typeof LABEL_FORMATS)[number]["key"];

/** Orders that still need to be packed and sent. */
export const LABEL_READY_STATUSES = ["paid", "processing", "packed", "pending", "awaiting_payment"] as const;

export function parseLabelFormat(value: string | null | undefined): LabelFormat {
  return value === "a4" ? "a4" : "label";
}

/** "a,b,c" from ?orders=, de-duplicated, only id-like values, at most 60. */
export function parseOrderIds(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => /^[\w-]{6,64}$/.test(id)))].slice(0, 60);
}

export interface LabelAddress {
  street?: unknown;
  city?: unknown;
  state?: unknown;
  country?: unknown;
  postalCode?: unknown;
}

/** Address lines for the label; empty when the customer collected the order. */
export function addressLines(address: unknown): string[] {
  if (!address || typeof address !== "object" || Array.isArray(address)) return [];
  const a = address as LabelAddress;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const cityLine = [text(a.city), text(a.state)].filter(Boolean).join(", ");
  // NIPOST digital postcodes print spaced, the way the postcode finder shows them: "LA 11 W06 TC 10".
  const postcode = parseNgPostcode(text(a.postalCode))?.spaced ?? text(a.postalCode);
  return [text(a.street), cityLine, text(a.country) && text(a.country).toUpperCase() !== "NG" && text(a.country).toLowerCase() !== "nigeria" ? text(a.country) : "", postcode].filter(Boolean);
}

/** What the rider must collect: unpaid orders are pay on delivery. */
export function amountToCollect(order: { status: string; total: number }): number {
  return order.status === "pending" || order.status === "awaiting_payment" ? Math.max(0, Number(order.total) || 0) : 0;
}

export function itemCount(items: unknown): number {
  return Array.isArray(items) ? items.reduce((sum, item) => sum + (Number((item as { quantity?: unknown })?.quantity) || 1), 0) : 0;
}
