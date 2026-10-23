import "server-only";
import { db } from "@/lib/db/client";
import {
  PLAN_NAMES,
  atLimit,
  cheapestPlanWhere,
  planKeyFor,
  sellerLimits,
  type PlanKey,
  type SellerLimits,
} from "@shared/plans";
import { checkThemeSwitch } from "@/lib/theme-access";
import { loadSellerThemeAccess } from "@/lib/theme-access.server";

// What a seller's plan lets them do (shared/plans.ts), checked where they do it: adding products, dropship, custom
// domains, themes, the states they sell in, delivery partners, pay on delivery, seasonal campaigns, the delivery
// exceptions inbox, priority support and imports.
// Each check returns null when allowed, or the words to show (with the plan that unlocks it). Things the seller
// already has keep working after a downgrade; only adding more is stopped.

export interface SellerPlan {
  key: PlanKey;
  limits: SellerLimits;
}

export async function sellerPlan(userId: string): Promise<SellerPlan> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { aiCredits: true } });
  const key = planKeyFor("seller", user?.aiCredits);
  return { key, limits: sellerLimits(key) };
}

function upgradeTo(test: (limits: SellerLimits) => boolean) {
  const plan = cheapestPlanWhere("seller", (key) => test(sellerLimits(key)));
  return plan ? PLAN_NAMES[plan] : null;
}

const more = (limit: number | null, count: number) => (limit === null ? Infinity : limit) > count;

/** Adding `adding` products (all of them dropship when `dropship`). */
export async function productLimitProblem(userId: string, storeId: string, adding = 1, dropship = false): Promise<string | null> {
  const { limits } = await sellerPlan(userId);
  const products = limits.products === null ? 0 : await db.storeProduct.count({ where: { storeId, status: { not: "archived" } } });
  if (limits.products !== null && products + adding > limits.products) {
    const plan = upgradeTo((next) => more(next.products, products + adding - 1));
    return `Your plan includes up to ${limits.products} products and you have ${products}.${plan ? ` Upgrade to ${plan} to add more.` : ""}`;
  }
  return dropship ? dropshipLimitProblem(userId, storeId, adding) : null;
}

/** Making `adding` more of the store's products dropship (new ones, or existing ones switched to dropship). */
export async function dropshipLimitProblem(userId: string, storeId: string, adding = 1): Promise<string | null> {
  const { limits } = await sellerPlan(userId);
  if (limits.dropshipProducts === null) return null;
  const dropshipped = await db.storeProduct.count({ where: { storeId, fulfillmentType: "dropship", status: { not: "archived" } } });
  if (dropshipped + adding <= limits.dropshipProducts) return null;
  const plan = upgradeTo((next) => more(next.dropshipProducts, dropshipped + adding - 1));
  return `Your plan includes up to ${limits.dropshipProducts} dropship products and you have ${dropshipped}.${plan ? ` Upgrade to ${plan} to dropship more.` : ""}`;
}

/** How many more products the seller can add (null: no limit), e.g. to cap Rex's sample products. */
export async function productsLeft(userId: string, storeId: string): Promise<number | null> {
  const { limits } = await sellerPlan(userId);
  if (limits.products === null) return null;
  const products = await db.storeProduct.count({ where: { storeId, status: { not: "archived" } } });
  return Math.max(0, limits.products - products);
}

export async function customDomainProblem(userId: string): Promise<string | null> {
  const { limits } = await sellerPlan(userId);
  if (limits.customDomain) return null;
  return `Your own domain comes with the ${upgradeTo((next) => next.customDomain) ?? "Starter"} plan. Your store stays on its Shopinbos address until then.`;
}

/**
 * Switching to a theme: its tier must come with the plan (Free basic, Starter premium, Growth and Pro platinum; see
 * src/lib/theme-access.ts) or the seller bought it. The theme the store already has (`currentThemeId`) always passes.
 */
export async function themeProblem(userId: string, themeId: string, currentThemeId?: string | null): Promise<string | null> {
  const access = await loadSellerThemeAccess(userId);
  return checkThemeSwitch(themeId, access.tier, currentThemeId, access.owned).message;
}

/**
 * Delivery areas after a change: the store's active areas minus `replacing`, plus `areas`. Each area with places
 * counts as one state (an area is a state or a city in one, e.g. "Abuja, FCT"); an "everywhere else" area (no places)
 * is nationwide. A change that doesn't add states beyond what the store already had is always fine, so a seller who
 * downgraded can still edit fees.
 */
export async function sellingStatesProblem(userId: string, storeId: string, areas: ReadonlyArray<{ regions: readonly string[] }>, replacing: readonly string[] = []): Promise<string | null> {
  const { limits } = await sellerPlan(userId);
  if (limits.sellingStates === null) return null;
  const zones = await db.shippingZone.findMany({ where: { storeId, active: true }, select: { id: true, regions: true } });
  const kept = zones.filter((zone) => !replacing.includes(zone.id));
  const count = (list: ReadonlyArray<{ regions: readonly string[] }>) => {
    const named = list.filter((area) => area.regions.length > 0);
    return { states: new Set(named.map((area) => area.regions.map((region) => region.trim().toLowerCase()).sort().join("|"))).size, everywhere: named.length < list.length };
  };
  const before = count(zones);
  const after = count([...kept, ...areas]);
  const plan = upgradeTo((next) => (after.everywhere ? next.sellingStates === null : more(next.sellingStates, after.states - 1)));
  const upgrade = plan ? ` Upgrade to ${plan} to deliver to more.` : "";
  if (after.everywhere && !before.everywhere) return `Delivering everywhere comes with the ${plan ?? "Growth"} plan. Your plan lets you sell in ${limits.sellingStates} state${limits.sellingStates === 1 ? "" : "s"}.`;
  if (after.states > limits.sellingStates && after.states > before.states) return `Your plan lets you sell in ${limits.sellingStates} state${limits.sellingStates === 1 ? "" : "s"}.${upgrade}`;
  return null;
}

/**
 * Delivery partners a seller works with: their connections ("My delivery partners"), the preferred one, and those
 * booked or quoted in the last 90 days.
 */
async function connectedPartners(userId: string, withPreferred = true) {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [connections, bookings, quotes, store] = await Promise.all([
    db.deliveryConnection.findMany({ where: { ownerUserId: userId, status: "active" }, select: { logisticsPartnerId: true } }).catch(() => []),
    db.deliveryBooking.findMany({ where: { sellerId: userId, createdAt: { gte: since } }, select: { logisticsPartnerId: true }, distinct: ["logisticsPartnerId"] }),
    db.deliveryQuoteRequest.findMany({ where: { sellerId: userId, createdAt: { gte: since } }, select: { logisticsPartnerId: true }, distinct: ["logisticsPartnerId"] }).catch(() => []),
    db.store.findUnique({ where: { userId }, select: { brandSettings: true } }),
  ]);
  const settings = (store?.brandSettings && typeof store.brandSettings === "object" ? store.brandSettings : {}) as Record<string, unknown>;
  const logistics = (settings.logistics && typeof settings.logistics === "object" ? settings.logistics : {}) as Record<string, unknown>;
  const ids = new Set<string>([...connections, ...bookings, ...quotes].map((row) => row.logisticsPartnerId).filter(Boolean));
  if (withPreferred && typeof logistics.preferredPartnerId === "string") ids.add(logistics.preferredPartnerId);
  return ids;
}

/**
 * Working with `partnerId`: fine if already connected, else within the plan's number of delivery partners.
 * `asPreferred`: it replaces the preferred partner, so the old one doesn't count.
 */
export async function deliveryPartnerProblem(userId: string, partnerId: string, asPreferred = false): Promise<string | null> {
  const { limits } = await sellerPlan(userId);
  if (limits.logisticsPartners === null) return null;
  const ids = await connectedPartners(userId, !asPreferred);
  if (ids.has(partnerId) || ids.size < limits.logisticsPartners) return null;
  const plan = upgradeTo((next) => more(next.logisticsPartners, ids.size));
  return `Your plan includes ${limits.logisticsPartners} delivery partner${limits.logisticsPartners === 1 ? "" : "s"} and you already work with ${ids.size}.${plan ? ` Upgrade to ${plan} to add more.` : ""}`;
}

export async function payOnDeliveryAllowed(userId: string) {
  return (await sellerPlan(userId)).limits.payOnDelivery;
}

export function payOnDeliveryPlanName() {
  return upgradeTo((next) => next.payOnDelivery) ?? "Growth";
}

export async function seasonalCampaignProblem(userId: string): Promise<string | null> {
  const { limits } = await sellerPlan(userId);
  if (limits.themes === "all_seasonal") return null;
  return `Seasonal campaigns come with the ${upgradeTo((next) => next.themes === "all_seasonal") ?? "Growth"} plan.`;
}

/** Order tracking pages and messages carry only the store's name (no Shopinbos mark, no partner's own page). */
export async function brandedTrackingFor(userId: string) {
  return (await sellerPlan(userId)).limits.brandedTracking;
}

/** The delivery exceptions inbox and sending a job to another partner (Growth and up). */
export async function exceptionsInboxProblem(userId: string): Promise<string | null> {
  const { limits } = await sellerPlan(userId);
  if (limits.exceptionsInbox) return null;
  return `The delivery exceptions inbox and sending a delivery to another partner come with the ${exceptionsInboxPlanName()} plan.`;
}

export function exceptionsInboxPlanName() {
  return upgradeTo((next) => next.exceptionsInbox) ?? "Growth";
}

/** Support tickets from sellers on a plan with priority support start one step higher (src/lib/support). */
export async function prioritySupportFor(userId: string) {
  return (await sellerPlan(userId)).limits.prioritySupport;
}

/** China import requests from sellers on a plan with priority imports go to the front of the sourcing team's queue. */
export async function chinaImportPriority(userId: string) {
  return (await sellerPlan(userId)).limits.chinaImport === "priority";
}

export async function chinaImportProblem(userId: string): Promise<string | null> {
  const { limits } = await sellerPlan(userId);
  if (limits.chinaImport !== "browse") return null;
  return `On the Free plan you can browse imports from China. Ordering them comes with the ${upgradeTo((next) => next.chinaImport !== "browse") ?? "Starter"} plan.`;
}

export { atLimit };
