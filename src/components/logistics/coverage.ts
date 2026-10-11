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
