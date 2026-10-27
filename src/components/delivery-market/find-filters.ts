import { PARTNER_SERVICES, canonicalState } from "@shared/delivery-market";
import { isPartnerBadge, type PartnerBadge } from "@shared/partner-tiers";

// "Find partners" filters from the page's search params (sellers and suppliers), for findPartners.

export interface FindFiltersShape {
  service: string | null;
  state: string | null;
  maxPrice: number | null;
  minRating: number | null;
  pickupPoints: boolean;
  q: string | null;
  /** Only partners showing this badge (Verified Individual, Registered Business, …). */
  badge: PartnerBadge | null;
}

export type FindSearch = { service?: string; state?: string; maxPrice?: string; minRating?: string; pickupPoints?: string; q?: string; badge?: string };

export function readFindFilters(params: FindSearch): FindFiltersShape {
  const number = (value: string | undefined) => {
    const n = Number(String(value ?? "").replace(/[₦,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    service: params.service && (PARTNER_SERVICES as readonly string[]).includes(params.service) ? params.service : null,
    state: canonicalState(params.state ?? "") ?? null,
    maxPrice: number(params.maxPrice),
    minRating: Math.min(number(params.minRating) ?? 0, 5) || null,
    pickupPoints: params.pickupPoints === "1" || params.pickupPoints === "on",
    q: params.q?.trim().slice(0, 80) || null,
    badge: isPartnerBadge(params.badge) ? params.badge : null,
  };
}

/** "Lagos · Ikeja" from where the business ships from. */
export function originLabel(origin: { state: string | null; area: string | null }) {
  return origin.state ? [origin.state, origin.area].filter(Boolean).join(" · ") : null;
}
