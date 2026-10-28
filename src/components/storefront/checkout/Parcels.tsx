"use client";

// Supplier parcels at checkout (shared/dropship-checkout.ts ParcelLine), the way a marketplace groups by seller:
// "2 parcels · Ships from Port Harcourt · ₦4,500 · Arrives Mon 3 – Thu 6 Nov". The quote API sends them for dropship
// items from suppliers (delivered with their own zone rates, or by delivery partners); their fees are already in the
// delivery total.

import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import type { ParcelLine } from "@shared/dropship-checkout";

export interface QuotedParcels {
  lines: ParcelLine[];
  /** False when every item ships from a supplier, so the store's own zone options don't apply. */
  ownItems: boolean;
}

/** Reads the quote's delivery block (an older server sends none). */
export function readQuotedParcels(delivery: unknown): QuotedParcels {
  const raw = delivery && typeof delivery === "object" ? (delivery as Record<string, unknown>) : {};
  const lines = Array.isArray(raw.parcels)
    ? (raw.parcels as unknown[]).filter((line): line is ParcelLine => !!line && typeof line === "object" && typeof (line as ParcelLine).shipmentKey === "string" && typeof (line as ParcelLine).fee === "number")
    : [];
  return { lines, ownItems: raw.ownItems !== false };
}

/** A supplier delivers a parcel itself: it texts the customer a code, and pay on delivery isn't taken. */
export const hasSupplierDelivery = (parcels: QuotedParcels) => parcels.lines.some((line) => line.bySupplier);

export function ParcelList({ theme, parcels, currency }: { theme: ShopperTheme; parcels: QuotedParcels; currency: string }) {
  if (!parcels.lines.length) return null;
  const count = parcels.lines.length + (parcels.ownItems && !parcels.lines.some((line) => line.shipmentKey === "own") ? 1 : 0);
  return (
    <div data-parcels className="mt-3 grid gap-2 rounded-[14px] border p-3 text-[14px]" style={{ borderColor: theme.border, background: theme.paper }}>
      <span className="font-semibold">{count > 1 ? `${count} parcels` : "Your parcel"}</span>
      {count > 1 ? <span className="text-[12.5px] leading-[1.5]" style={{ color: theme.muted }}>Your items ship from different places, so each parcel has its own delivery fee.</span> : null}
      <ul className="m-0 grid list-none gap-2 p-0">
        {parcels.lines.map((line) => (
          <li key={line.shipmentKey} className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block">{line.from ? `Ships from ${line.from}` : "From the shop"}</span>
              {line.arrival ? <span className="block text-[12.5px]" style={{ color: theme.muted }}>{line.arrival}</span> : null}
            </span>
            <strong className="shrink-0 tabular-nums">{line.fee > 0 ? formatStoreMoney(line.fee, currency) : "Free"}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
