import { NATIONWIDE, canonicalState, cardTimeframe, readRateRows, regionOf, startingPrice, type NgState } from "@shared/delivery-market";

// Logistics marketplace fields on the public partner API (consumed by the marketing website): services, coverage,
// pay on delivery, and the "from" price and timeframe from the partner's active public rate card.

/** Prisma select for the active public rate card's rows and the count of active pickup points. */
export const PUBLIC_MARKET_SELECT = {
  services: true,
  pickupAreas: true,
  deliveryAreas: true,
  offersPayOnDelivery: true,
  rateCards: { where: { ownerUserId: null, status: "active" }, orderBy: { createdAt: "desc" as const }, take: 1, select: { rows: true } },
  _count: { select: { pickupPoints: { where: { active: true } } } },
} as const;

type WithMarket = {
  basePrice: number;
  estimatedSpeed: string | null;
  services: string[];
  pickupAreas: string[];
  deliveryAreas: string[];
  offersPayOnDelivery: boolean;
  rateCards: Array<{ rows: unknown }>;
  _count: { pickupPoints: number };
};

/**
 * The partner as the public API returns it: the existing fields plus services, pickupAreas, deliveryAreas,
 * offersPayOnDelivery, startingPrice and timeframe (from the active public rate card, else basePrice and
 * estimatedSpeed) and pickupPointCount.
 */
export function withMarketFields<T extends WithMarket>(partner: T) {
  const { rateCards, _count, ...rest } = partner;
  const rows = readRateRows(rateCards[0]?.rows);
  return {
    ...rest,
    startingPrice: startingPrice(rows) ?? (partner.basePrice > 0 ? partner.basePrice : null),
    timeframe: cardTimeframe(rows) ?? partner.estimatedSpeed ?? null,
    pickupPointCount: _count.pickupPoints,
  };
}

/**
 * ?state=: the delivery-area tokens that cover a whole state (covers(deliveryAreas, { state, area: null }) in
 * shared/delivery-market.ts): Nationwide, the state's region, or the state itself. Null when the place is unknown.
 */
export function deliveryTokensForState(input: string): string[] | null {
  const state: NgState | null = canonicalState(input);
  if (!state) return null;
  const region = regionOf(state);
  return [NATIONWIDE, ...(region ? [region] : []), state];
}
