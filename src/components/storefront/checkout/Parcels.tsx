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

/** A small truck, in the text colour (storefronts don't load the app's icon set). */
function Truck() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </svg>
  );
}

/**
 * One card per parcel (the A-Checkout layout): "PARCEL 1 · SHIPS FROM PORT HARCOURT", then the arrival line and its
 * fee on a soft band. Colours, corners and type come from the shop's theme.
 */
export function ParcelList({ theme, parcels, currency }: { theme: ShopperTheme; parcels: QuotedParcels; currency: string }) {
  if (!parcels.lines.length) return null;
  const count = parcels.lines.length + (parcels.ownItems && !parcels.lines.some((line) => line.shipmentKey === "own") ? 1 : 0);
  const radius = Math.max(10, Math.min(22, theme.radius + 2));
  const band = `color-mix(in srgb, ${theme.ink} 5%, ${theme.paper})`;
  return (
    <section data-parcels aria-label={count > 1 ? `${count} parcels` : "Your parcel"} className="mt-3 grid gap-2.5 text-[14px]">
      {count > 1 ? <p className="m-0 text-[12.5px] leading-[1.5]" style={{ color: theme.muted }}>Your items ship from different places, so each parcel has its own delivery fee.</p> : null}
      <ol className="m-0 grid list-none gap-2.5 p-0">
        {parcels.lines.map((line, index) => (
          <li key={line.shipmentKey} className="grid gap-2 border px-3 py-2.5" style={{ borderColor: theme.border, background: theme.paper, borderRadius: radius }}>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.05em]" style={{ color: theme.muted }}>
              {count > 1 ? `Parcel ${index + 1} · ` : ""}{line.from ? `Ships from ${line.from}` : "From the shop"}
            </span>
            <span className="flex items-center gap-2 px-2.5 py-2 text-[13px]" style={{ background: band, borderRadius: Math.max(8, radius - 6) }}>
              <Truck />
              <span className="min-w-0 flex-1">{line.arrival ?? "Delivery"}</span>
              <strong className="shrink-0 tabular-nums">{line.fee > 0 ? formatStoreMoney(line.fee, currency) : "Free"}</strong>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
