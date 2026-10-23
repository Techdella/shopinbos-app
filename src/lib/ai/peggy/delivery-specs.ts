// Peggy's delivery tools: find delivery partners for an order, ask one for a quote, connect one. Input schemas;
// pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";

const confirmCode = z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller says yes in their next message");
const orderNumber = z.string().trim().min(1).max(40).describe("The order number, e.g. SB-MVFK6LH2-A8E5A0");
const partner = z.string().trim().min(1).max(120).describe("The partner's name or slug, exactly as find_delivery_partners gave it");

export const DELIVERY_TOOL_SPECS = {
  find_delivery_partners: {
    write: false,
    description:
      "The best verified delivery companies on Shopinbos for an order (where the customer is, from the order's address) or for a state, from where the shop sends: each with its price for that trip (or its lowest price), how long it takes, on-time record, rating, pay on delivery, pickup points, whether the shop already works with them, and a link to their page. Pass a budget to keep to partners at or under it; when none fit, you get the cheapest ones and how far over budget they are.",
    schema: z
      .object({
        orderNumber: orderNumber.nullable().describe("The order to deliver, or null to search by state"),
        state: z.string().trim().max(60).nullable().describe("Where the parcel is going (a Nigerian state or city), when there's no order; null otherwise"),
        budget: z.number().positive().max(10_000_000).nullable().describe("Most the seller wants to pay for this delivery, in naira, or null"),
        limit: z.number().int().min(1).max(5).nullable().describe("How many partners (1-5); null for 3"),
      })
      .strict(),
  },
  request_delivery_quote: {
    write: true,
    description:
      "Ask a delivery company for a price to deliver one order: sends them the pickup place, the customer's area and what's in the parcel; they answer on the seller's Logistics page, where the seller accepts. Call first with confirmCode null: nothing is sent and you get a preview and a code. Only after the seller clearly says yes (in their next message) call again with the same details and that code.",
    schema: z
      .object({
        orderNumber,
        partner,
        preferredDate: z.string().trim().max(10).nullable().describe("YYYY-MM-DD for pickup, or null for as soon as possible"),
        fragile: z.boolean().nullable().describe("true when the parcel is breakable; null for no"),
        confirmCode,
      })
      .strict(),
  },
  connect_delivery_partner: {
    write: true,
    description:
      "Add a delivery company to the shop's delivery partners at their public prices, so checkout can offer them and new paid orders go to them as jobs automatically. Call first with confirmCode null for a preview and a code; only after the seller says yes, call again with that code.",
    schema: z.object({ partner, confirmCode }).strict(),
  },
} as const;

export interface DeliveryMatch {
  name: string;
  /** This trip's price when the rate card prices the route, else the partner's lowest price. */
  price: number;
  /** True when `price` is for this exact trip. */
  priced: boolean;
  score: number;
}

/**
 * The partners to show: best first, within the budget when there is one. When none fit the budget, the cheapest
 * ones instead, flagged so Peggy can say how far over they are.
 */
export function pickDeliveryMatches<T extends DeliveryMatch>(rows: readonly T[], budget: number | null, limit: number) {
  const ranked = [...rows].sort((a, b) => b.score - a.score || a.price - b.price);
  if (!budget) return { matches: ranked.slice(0, limit), withinBudget: true };
  const fit = ranked.filter((row) => row.price <= budget);
  if (fit.length) return { matches: fit.slice(0, limit), withinBudget: true };
  return { matches: [...rows].sort((a, b) => a.price - b.price).slice(0, limit), withinBudget: false };
}
