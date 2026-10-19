import "server-only";
import { db } from "@/lib/db/client";
import { activeRiderCounts } from "./partner-riders.server";

// Checked delivery companies that serve a place, for suppliers (and anyone else who only knows a city). Partners
// list coverage by state ("Oyo (Within the state)") while people give a city ("Ibadan"), so the main cities of the
// areas we're starting in map to their state.

const CITY_STATE: Record<string, string> = {
  ibadan: "oyo", ogbomoso: "oyo", oyo: "oyo",
  osogbo: "osun", oshogbo: "osun", "ile-ife": "osun", ife: "osun", ilesa: "osun", ede: "osun", iwo: "osun",
  ikeja: "lagos", lekki: "lagos", yaba: "lagos", surulere: "lagos", ikorodu: "lagos", ajah: "lagos", "victoria island": "lagos", lagos: "lagos",
  abuja: "abuja", "port harcourt": "rivers", abeokuta: "ogun", akure: "ondo", "ado-ekiti": "ekiti", ilorin: "kwara",
};

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

export function placeTerms(city: string | null | undefined) {
  const c = norm(city);
  return [...new Set([c, CITY_STATE[c]].filter((term): term is string => Boolean(term)))];
}

export function servesPlace(partner: { city: string; coverageZones: string[] }, terms: string[]) {
  if (terms.length === 0) return false;
  const places = [norm(partner.city), ...partner.coverageZones.map(norm)];
  return terms.some((term) => places.some((place) => place === term || place.startsWith(`${term} `) || place.startsWith(`${term}(`) || place.includes(term)));
}

/** Verified, active partners serving the city (most reliable first), with their active rider counts. */
export async function partnersNear(city: string | null | undefined, take = 8) {
  const terms = placeTerms(city);
  const partners = await db.logisticsPartner.findMany({
    where: { status: "active", verificationStatus: "verified", ownerId: null },
    orderBy: [{ reliabilityScore: "desc" }, { createdAt: "asc" }],
    take: 300,
    select: { id: true, displayName: true, slug: true, logoUrl: true, city: true, coverageZones: true, basePrice: true, estimatedSpeed: true, whatsappNumber: true, reliabilityScore: true },
  });
  const near = partners.filter((partner) => servesPlace(partner, terms)).slice(0, take);
  const riders = await activeRiderCounts(near.map((partner) => partner.id));
  return near.map((partner) => ({ ...partner, riders: riders.get(partner.id) ?? 0 }));
}
