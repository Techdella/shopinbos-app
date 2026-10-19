import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { STORE_LAUNCH_DEPOSIT_NGN, STORE_LAUNCH_TOTAL_NGN } from "@/lib/store-launch-billing";
import { mergePreferences, parsePreferences } from "@shared/preferences";
import { DEFAULT_PAYMENT_METHODS, type PaymentMethodKey } from "@shared/onboarding";
import { toggleableItems } from "@/lib/nav";
import { applySetupChoice, buildSetupChecklist, readSetupChoices, type SetupChoicePatch, type SetupFacts } from "./checklist";

// Server side of Start here: reads the facts the checklist is built from, saves the seller's choices, and the
// small setup writes (payment methods, delivery areas) shared by the Start here page and Peggy's setup tools.

/** The nav item id of "Start here" (src/lib/nav.ts). Hidden through preferences once setup is done or dismissed. */
export const START_NAV_ID = "start";

/** Delivery zones made from Start here or by Peggy. Tagged inside the rate data, like onboarding's. */
export const SETUP_ZONE_SOURCE = "setup";

export class SetupError extends Error {}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const PAYMENT_KEYS = Object.keys(DEFAULT_PAYMENT_METHODS) as PaymentMethodKey[];

/** The seller's saved payment choices, or null when they never saved any. */
function savedMethods(settings: Record<string, unknown>): Partial<Record<PaymentMethodKey, boolean>> | null {
  const saved = record(record(settings.paymentConfig).methods);
  const chosen = PAYMENT_KEYS.filter((key) => typeof saved[key] === "boolean");
  return chosen.length ? Object.fromEntries(chosen.map((key) => [key, saved[key] as boolean])) : null;
}

/** Everything Start here needs for one seller, or null when they have no shop yet. */
export async function getSetupOverview(userId: string) {
  const store = await db.store.findUnique({
    where: { userId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      status: true,
      customDomain: true,
      onboardingState: true,
      brandSettings: true,
    },
  });
  if (!store) return null;

  const [products, productsWithPhotos, zones, subscribers, campaignsSent, onlineOrders] = await Promise.all([
    db.storeProduct.count({ where: { storeId: store.id, status: { not: "archived" } } }),
    db.storeProduct.count({ where: { storeId: store.id, status: { not: "archived" }, images: { isEmpty: false } } }),
    db.shippingZone.findMany({ where: { storeId: store.id, active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, regions: true, rates: true } }),
    db.subscriber.count({ where: { storeId: store.id, status: "active" } }),
    db.broadcastCampaign.count({ where: { storeId: store.id, status: "sent" } }),
    db.retailOrder.count({ where: { storeId: store.id, channel: "online_store" } }),
  ]);

  const wallet = await db.wallet.findUnique({ where: { userId }, select: { subaccountStatus: true } }).catch(() => null);
  const settings = record(store.brandSettings);
  const editor = record(settings.editor);
  const bank = record(settings.payoutBank);
  const choices = readSetupChoices(store.brandSettings);
  const methods = savedMethods(settings);
  // Same rule as the onboarding status: Store.status defaults to "active", so it alone doesn't mean launched.
  const live = store.onboardingState === "LIVE" || (store.status === "active" && Boolean(editor.published));

  const facts: SetupFacts = {
    lookChosen: Boolean(editor.draft || editor.published || settings.template),
    products,
    productsWithPhotos,
    paymentMethodsOn: methods ? Object.values(methods).filter(Boolean).length : 0,
    activeDeliveryZones: zones.length,
    // The Shopinbos Wallet bank (card payments split straight to it); an old payout bank still counts.
    payoutBank: Boolean(bank.paystackRecipientCode || bank.accountNumberMask) || ["active", "review"].includes(wallet?.subaccountStatus ?? ""),
    live,
    shared: Boolean(choices.sharedAt) || onlineOrders > 0,
    customDomain: Boolean(store.customDomain),
    subscribers,
    campaignsSent,
  };

  return {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      logoUrl: store.logoUrl,
      url: buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }),
    },
    facts,
    choices,
    checklist: buildSetupChecklist(facts, choices),
    payments: { ...DEFAULT_PAYMENT_METHODS, ...(methods ?? {}) } as Record<PaymentMethodKey, boolean>,
    zones: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      regions: zone.regions,
      fee: Number(record(Array.isArray(zone.rates) ? zone.rates[0] : null).price ?? 0) || 0,
    })),
    launch: { totalNgn: STORE_LAUNCH_TOTAL_NGN, depositNgn: STORE_LAUNCH_DEPOSIT_NGN },
  };
}

export type SetupOverview = NonNullable<Awaited<ReturnType<typeof getSetupOverview>>>;

/** Saves a Start here choice (skip, dismiss, shared…) and keeps the "Start here" menu item in step. */
export async function saveSetupChoice(userId: string, patch: SetupChoicePatch) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, brandSettings: true } });
  if (!store) throw new SetupError("Store not found.");
  const settings = record(store.brandSettings);
  const setup = record(settings.setup);
  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...settings, setup: { ...setup, start: applySetupChoice(store.brandSettings, patch) } } as Prisma.InputJsonValue },
  });
  const overview = await getSetupOverview(userId);
  // Hide the menu item when setup is done or dismissed; show it again only when the seller asks to.
  if (overview && (patch.type === "reopen" || !overview.checklist.showStart)) await syncStartNav(userId, overview.checklist.showStart);
  return overview;
}

/** Hides "Start here" in the menu once setup is done or dismissed, and shows it again if the seller reopens it. */
export async function syncStartNav(userId: string, show: boolean) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = parsePreferences(user?.preferences);
  const hidden = prefs.hiddenNav.includes(START_NAV_ID);
  if (hidden === !show) return;
  const hiddenNav = show ? prefs.hiddenNav.filter((id) => id !== START_NAV_ID) : [...prefs.hiddenNav, START_NAV_ID];
  const allowed = new Set(toggleableItems("seller").map((item) => item.id));
  const next = mergePreferences(prefs, { hiddenNav }, allowed);
  await db.user.update({ where: { id: userId }, data: { preferences: next as unknown as Prisma.InputJsonValue } });
}

/**
 * Turns payment methods on or off. Unlisted methods keep their saved value (or the default when the seller
 * never chose). At least one must stay on, because checkout needs a way to pay.
 */
export async function setPaymentMethods(storeId: string, changes: Partial<Record<PaymentMethodKey, boolean>>) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  if (!store) throw new SetupError("Store not found.");
  const settings = record(store.brandSettings);
  const paymentConfig = record(settings.paymentConfig);
  const current = { ...DEFAULT_PAYMENT_METHODS, ...(savedMethods(settings) ?? {}) };
  const next = Object.fromEntries(PAYMENT_KEYS.map((key) => [key, typeof changes[key] === "boolean" ? changes[key] : current[key]])) as Record<PaymentMethodKey, boolean>;
  if (!Object.values(next).some(Boolean)) throw new SetupError("Keep at least one way for customers to pay.");
  await db.store.update({
    where: { id: storeId },
    data: { brandSettings: { ...settings, paymentConfig: { ...paymentConfig, methods: next } } as Prisma.InputJsonValue },
  });
  return next;
}

export interface DeliveryAreaInput {
  name: string;
  fee: number;
  /** Cities, states or areas this fee covers; empty = everywhere else. */
  regions: string[];
}

function cleanArea(area: DeliveryAreaInput): DeliveryAreaInput {
  const name = area.name.trim().slice(0, 80);
  const regions = [...new Set(area.regions.map((region) => region.trim()).filter((region) => region.length >= 2).map((region) => region.slice(0, 60)))].slice(0, 30);
  const fee = Math.round(area.fee);
  if (name.length < 2) throw new SetupError("Give the delivery area a name.");
  if (!Number.isFinite(fee) || fee < 0 || fee > 1_000_000) throw new SetupError("Delivery fees must be between ₦0 and ₦1,000,000.");
  return { name, fee, regions };
}

/**
 * Adds a delivery area or updates the one with the same name (case-insensitive). Checkout uses the first zone
 * whose regions match, so specific areas are kept first and catch-all areas (no regions) last.
 */
export async function upsertDeliveryArea(storeId: string, input: DeliveryAreaInput) {
  const area = cleanArea(input);
  const existing = await db.shippingZone.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, regions: true, active: true } });
  const match = existing.find((zone) => zone.name.trim().toLowerCase() === area.name.toLowerCase());
  const rates = [{ name: "Standard delivery", minValue: 0, minWeight: 0, price: area.fee, source: SETUP_ZONE_SOURCE }];

  const saved = match
    ? await db.shippingZone.update({ where: { id: match.id }, data: { regions: area.regions, rates, active: true } })
    : await db.shippingZone.create({ data: { storeId, name: area.name, type: "flat_rate", regions: area.regions, rates, sortOrder: existing.length, active: true } });

  await reorderZones(storeId);
  return { ...area, id: saved.id, created: !match };
}

/** Replaces the delivery areas set from Start here (or by onboarding) with this list. Other zones are kept. */
export async function replaceSetupDeliveryAreas(storeId: string, inputs: DeliveryAreaInput[]) {
  const areas = inputs.map(cleanArea);
  if (!areas.length) throw new SetupError("Pick at least one place you deliver to.");
  const existing = await db.shippingZone.findMany({ where: { storeId }, select: { id: true, rates: true } });
  const ours = existing
    .filter((zone) => Array.isArray(zone.rates) && zone.rates.some((rate) => ["onboarding", SETUP_ZONE_SOURCE].includes(String(record(rate).source))))
    .map((zone) => zone.id);
  await db.$transaction([
    db.shippingZone.deleteMany({ where: { id: { in: ours } } }),
    ...areas.map((area, index) =>
      db.shippingZone.create({
        data: {
          storeId,
          name: area.name,
          type: "flat_rate",
          regions: area.regions,
          rates: [{ name: "Standard delivery", minValue: 0, minWeight: 0, price: area.fee, source: SETUP_ZONE_SOURCE }],
          sortOrder: 1000 + index,
          active: true,
        },
      }),
    ),
  ]);
  await reorderZones(storeId);
  return areas;
}

/** Specific areas first (in their current order), catch-alls last, numbered 0..n. */
async function reorderZones(storeId: string) {
  const zones = await db.shippingZone.findMany({ where: { storeId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, regions: true, sortOrder: true } });
  const ordered = [...zones.filter((zone) => zone.regions.length > 0), ...zones.filter((zone) => zone.regions.length === 0)];
  const updates = ordered.map((zone, index) => (zone.sortOrder === index ? null : db.shippingZone.update({ where: { id: zone.id }, data: { sortOrder: index } }))).filter((update) => update !== null);
  if (updates.length) await db.$transaction(updates);
}
