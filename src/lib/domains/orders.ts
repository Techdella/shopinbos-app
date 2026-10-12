// Vercel domain order ids a store placed (Store.brandSettings.domainOrders). Pure.
export function domainOrdersOf(brandSettings: unknown): string[] {
  const settings = brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? (brandSettings as Record<string, unknown>) : {};
  return Array.isArray(settings.domainOrders) ? settings.domainOrders.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 20) : [];
}
