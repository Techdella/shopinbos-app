// Reads the coverage the portal saves into LogisticsPartner.coverageMap (see updateLogisticsCoverage).

export interface CoverageZoneRow {
  name: string;
  service: string;
  basePrice: number;
  demandSignal?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Saved per-area rows, falling back to the plain zone list at the base price. */
export function coverageZoneRows(partner: { coverageMap: unknown; coverageZones: string[]; basePrice: number }): CoverageZoneRow[] {
  const zones = asRecord(partner.coverageMap)?.zones;
  const rows = Array.isArray(zones)
    ? zones
        .map(asRecord)
        .filter((zone): zone is Record<string, unknown> => Boolean(zone && typeof zone.name === "string" && zone.name))
        .map((zone) => ({
          name: String(zone.name),
          service: typeof zone.service === "string" && zone.service ? zone.service : "Same-day",
          basePrice: Number(zone.basePrice) || 0,
          ...(typeof zone.demandSignal === "string" && zone.demandSignal ? { demandSignal: zone.demandSignal } : {}),
        }))
    : [];
  if (rows.length) return rows;
  return partner.coverageZones.map((name) => ({ name, service: "Same-day", basePrice: partner.basePrice }));
}

export function coverageDepot(partner: { coverageMap: unknown }) {
  const depot = asRecord(partner.coverageMap)?.depot;
  return typeof depot === "string" && depot ? depot : null;
}

const SCOPES = ["intrastate", "interstate", "cross_country", "regional"] as const;
type Scope = (typeof SCOPES)[number];

/**
 * Zones for the coverage editor: the saved zones with their state and scope, or (for areas typed in before the
 * state pick list) the area name standing in for the state, like onboarding does.
 */
export function editorZones(partner: { coverageMap: unknown; coverageZones: string[]; basePrice: number; country: string | null }) {
  const country = partner.country || "Nigeria";
  const saved = asRecord(partner.coverageMap)?.zones;
  const zones = Array.isArray(saved)
    ? saved.map(asRecord).filter((zone): zone is Record<string, unknown> => Boolean(zone && typeof zone.name === "string" && zone.name))
    : [];
  const rows = zones.length
    ? zones.map((zone) => ({
        name: String(zone.name),
        country: typeof zone.country === "string" && zone.country ? zone.country : country,
        region: typeof zone.region === "string" && zone.region ? zone.region : String(zone.name),
        scope: (SCOPES as readonly string[]).includes(String(zone.scope)) ? (zone.scope as Scope) : ("intrastate" as Scope),
        service: typeof zone.service === "string" && zone.service ? zone.service : "Same-day",
        basePrice: Number(zone.basePrice) || partner.basePrice || 0,
        active: zone.active !== false,
        ...(typeof zone.demandSignal === "string" && zone.demandSignal ? { demandSignal: zone.demandSignal } : {}),
      }))
    : partner.coverageZones.map((name) => ({ name, country, region: name, scope: "intrastate" as Scope, service: "Same-day", basePrice: partner.basePrice, active: true }));
  return rows;
}
