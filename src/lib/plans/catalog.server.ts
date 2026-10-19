import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createPaystackPlan } from "@/lib/paystack";
import {
  BUILTIN_PLAN_VERSIONS,
  PLAN_TIERS,
  PLAN_TIER_KEYS,
  cleanPlanAmount,
  cleanPlanCredits,
  paystackPlanName,
  registerPlanVersions,
  type PlanBilling,
  type PlanOfferView,
  type PlanTier,
  type PlanVersion,
} from "@shared/plan-catalog";

// The live plan catalog (shared/plan-catalog.ts): every Paystack plan code from SubscriptionPlanVersion (the six
// built-in ones if the table can't be read) and each tier's monthly AI credits (PlatformSetting
// "plan.<tier>.credits"). Loading it also registers the codes so the pure helpers (seller-plan.ts, store-badges.ts,
// ai-credits.ts) know plans created from admin. Cached per instance like the price book.

const CACHE_MS = 30_000;
const creditsKey = (tier: PlanTier) => `plan.${tier}.credits`;
const priceKey = (tier: PlanTier, billing: PlanBilling) => `plan.${tier}.${billing}`;

export interface TierOffer {
  tier: PlanTier;
  creditsPerMonth: number;
  monthly: PlanVersion | null;
  annual: PlanVersion | null;
}

export interface PlanCatalog {
  tiers: Record<PlanTier, TierOffer>;
  versions: PlanVersion[];
  creditsPerMonth: Record<PlanTier, number>;
}

const store = globalThis as typeof globalThis & { __shopinbosPlanCatalog?: { catalog: PlanCatalog; at: number } | null };

export function clearPlanCatalogCache() {
  store.__shopinbosPlanCatalog = null;
}

function build(versions: PlanVersion[], credits: Partial<Record<PlanTier, number>>): PlanCatalog {
  const creditsPerMonth = Object.fromEntries(PLAN_TIER_KEYS.map((tier) => [tier, credits[tier] ?? PLAN_TIERS[tier].defaults.creditsPerMonth])) as Record<PlanTier, number>;
  const current = (tier: PlanTier, billing: PlanBilling) =>
    PLAN_TIERS[tier].billings.includes(billing) ? versions.find((v) => v.tier === tier && v.billing === billing && v.current && v.amountNgn !== null) ?? null : null;
  const tiers = Object.fromEntries(
    PLAN_TIER_KEYS.map((tier) => [tier, { tier, creditsPerMonth: creditsPerMonth[tier], monthly: current(tier, "monthly"), annual: current(tier, "annual") }]),
  ) as Record<PlanTier, TierOffer>;
  return { tiers, versions, creditsPerMonth };
}

async function load(): Promise<PlanCatalog> {
  const [rows, settings] = await Promise.all([
    db.subscriptionPlanVersion.findMany({ select: { code: true, tier: true, billing: true, amountNgn: true, current: true } }),
    db.platformSetting.findMany({ where: { key: { in: PLAN_TIER_KEYS.map(creditsKey) } }, select: { key: true, value: true } }),
  ]);
  const known = rows.filter((row): row is typeof row & { tier: PlanTier; billing: PlanBilling } => row.tier in PLAN_TIERS && (row.billing === "monthly" || row.billing === "annual"));
  // Built-in codes the table doesn't have yet still count (before the migration, or a row removed by hand).
  const versions: PlanVersion[] = [...known, ...BUILTIN_PLAN_VERSIONS.filter((builtin) => !known.some((row) => row.code === builtin.code))];
  const credits: Partial<Record<PlanTier, number>> = {};
  for (const setting of settings) {
    const tier = setting.key.split(".")[1] as PlanTier;
    const value = cleanPlanCredits(setting.value);
    if (value !== null) credits[tier] = value;
  }
  return build(versions, credits);
}

/** Never throws: if the database can't answer, the last catalog (or the built-in plans) is used. */
export async function getPlanCatalog(): Promise<PlanCatalog> {
  const cached = store.__shopinbosPlanCatalog;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.catalog;
  let catalog: PlanCatalog;
  try {
    catalog = await load();
    store.__shopinbosPlanCatalog = { catalog, at: Date.now() };
  } catch (error) {
    console.error("[plans] couldn't read the plan catalog; using the last known or built-in plans", error);
    catalog = cached?.catalog ?? build([...BUILTIN_PLAN_VERSIONS], {});
  }
  registerPlanVersions(catalog.versions);
  return catalog;
}

export class PlanSaveError extends Error {}

export interface TierChange {
  monthlyNgn?: unknown;
  annualNgn?: unknown;
  creditsPerMonth?: unknown;
}

/**
 * Saves a tier. A changed price creates a new Paystack plan first (nothing is saved if Paystack refuses), then marks
 * it current; the old code stays known for the people already on it. Every change is in the pricing history.
 */
export async function savePlanTier(tier: PlanTier, change: TierChange, by: { userId: string; note?: string | null }) {
  const info = PLAN_TIERS[tier];
  const catalog = await load();
  const offer = catalog.tiers[tier];
  const note = by.note?.trim().slice(0, 500) || null;

  const newPrices: Array<{ billing: PlanBilling; amountNgn: number; before: number | null; oldCode: string | null }> = [];
  for (const billing of info.billings) {
    const raw = billing === "monthly" ? change.monthlyNgn : change.annualNgn;
    if (raw === undefined || raw === "") continue;
    const amountNgn = cleanPlanAmount(raw);
    if (amountNgn === null) throw new PlanSaveError(`${billing === "monthly" ? "Monthly" : "Yearly"} price: whole naira from ₦100.`);
    const current = offer[billing];
    if (current?.amountNgn === amountNgn) continue;
    newPrices.push({ billing, amountNgn, before: current?.amountNgn ?? null, oldCode: current?.code ?? null });
  }
  let credits: number | null = null;
  if (change.creditsPerMonth !== undefined && change.creditsPerMonth !== "") {
    credits = cleanPlanCredits(change.creditsPerMonth);
    if (credits === null) throw new PlanSaveError("Monthly AI credits: a whole number from 0.");
    if (credits === offer.creditsPerMonth) credits = null;
  }
  const monthly = newPrices.find((p) => p.billing === "monthly")?.amountNgn ?? offer.monthly?.amountNgn ?? null;
  const annual = newPrices.find((p) => p.billing === "annual")?.amountNgn ?? offer.annual?.amountNgn ?? null;
  if (monthly !== null && annual !== null && annual > monthly * 12) throw new PlanSaveError("The yearly price can't be more than twelve monthly payments.");
  if (!newPrices.length && credits === null) return { created: [] as string[], changed: 0 };

  // Paystack first: if it refuses, nothing changes here.
  const created: Array<(typeof newPrices)[number] & { code: string }> = [];
  for (const price of newPrices) {
    const code = await createPaystackPlan({
      name: paystackPlanName(tier, price.billing, price.amountNgn),
      amountKobo: price.amountNgn * 100,
      interval: price.billing === "annual" ? "annually" : "monthly",
      description: `Created from Shopinbos Admin › Pricing › Plans${note ? `: ${note}` : ""}`,
    });
    created.push({ ...price, code });
  }

  const now = new Date();
  await db.$transaction([
    ...created.flatMap((price) => [
      db.subscriptionPlanVersion.updateMany({ where: { tier, billing: price.billing, current: true }, data: { current: false, retiredAt: now } }),
      db.subscriptionPlanVersion.create({ data: { code: price.code, tier, billing: price.billing, amountNgn: price.amountNgn, current: true, createdById: by.userId } }),
    ]),
    ...(credits !== null
      ? [db.platformSetting.upsert({ where: { key: creditsKey(tier) }, create: { key: creditsKey(tier), value: credits, updatedById: by.userId }, update: { value: credits, updatedById: by.userId } })]
      : []),
    db.platformSettingChange.createMany({
      data: [
        ...created.map((price) => ({
          key: priceKey(tier, price.billing),
          before: (price.before === null ? null : { amountNgn: price.before, code: price.oldCode }) as Prisma.InputJsonValue,
          after: { amountNgn: price.amountNgn, code: price.code } as Prisma.InputJsonValue,
          note,
          changedById: by.userId,
        })),
        ...(credits !== null ? [{ key: creditsKey(tier), before: offer.creditsPerMonth, after: credits, note, changedById: by.userId }] : []),
      ],
    }),
  ]);
  clearPlanCatalogCache();
  return { created: created.map((price) => price.code), changed: created.length + (credits !== null ? 1 : 0) };
}

/** Plan changes for the history list (prices and credits). */
export async function planHistory(limit = 30) {
  return db.platformSettingChange.findMany({
    where: { key: { startsWith: "plan." } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, key: true, before: true, after: true, note: true, createdAt: true, changedBy: { select: { name: true, email: true } } },
  });
}

/** How many people are on each plan code (shown next to old prices: they keep them until they cancel). */
export async function subscribersByCode() {
  const rows = await db.user.groupBy({ by: ["planCode"], where: { planCode: { not: null }, planStatus: { in: ["active", "non_renewing"] } }, _count: { _all: true } }).catch(() => []);
  return new Map(rows.map((row) => [row.planCode!, row._count._all]));
}

function view(offer: TierOffer): PlanOfferView {
  const pick = (version: PlanVersion | null) => (version && version.amountNgn !== null ? { code: version.code, amountNgn: version.amountNgn } : null);
  return { monthly: pick(offer.monthly), annual: pick(offer.annual), creditsPerMonth: offer.creditsPerMonth };
}

/** What the billing pages sell today (plain JSON for client components). */
export async function planOffers() {
  const { tiers } = await getPlanCatalog();
  return { growth: view(tiers.seller_growth), pro: view(tiers.seller_pro), supplierMax: view(tiers.supplier_max) };
}
