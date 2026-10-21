import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createPaystackPlan, updatePaystackPlanAmount } from "@/lib/paystack";
import {
  BUILTIN_PLAN_VERSIONS,
  LEGACY_TIERS,
  PLAN_TIERS,
  PLAN_TIER_KEYS,
  cleanPlanAmount,
  cleanPlanCredits,
  paystackPlanName,
  priceMoves,
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

function defaultPrice(tier: PlanTier, billing: PlanBilling) {
  return billing === "annual" ? PLAN_TIERS[tier].defaults.annualNgn : PLAN_TIERS[tier].defaults.monthlyNgn;
}

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

/**
 * October 2026: the old tiers were renamed (Growth → Starter, Seller Pro → Growth, Supplier Max → Supplier Pro). Their
 * rows are renamed once; a row whose price isn't the new tier's stops being current until Admin › Pricing › Plans
 * applies the new prices. The flag row is written first in the same transaction, so two servers can't both rename
 * (the second waits on the key, then fails and rolls back). Old monthly-credit settings meant the old tiers, so
 * they are dropped and the new defaults apply.
 */
const MIGRATION_KEY = "plans.v2026_10";
async function migrateLegacyTiers() {
  const done = await db.platformSetting.findUnique({ where: { key: MIGRATION_KEY }, select: { key: true } });
  if (done) return;
  try {
    await db.$transaction(async (tx) => {
      await tx.platformSetting.create({ data: { key: MIGRATION_KEY, value: { at: new Date().toISOString() } } });
      // Order matters: seller_growth rows become seller_starter before seller_pro rows take the seller_growth name.
      for (const [legacy, next] of Object.entries(LEGACY_TIERS)) {
        const rows = await tx.subscriptionPlanVersion.findMany({ where: { tier: legacy }, select: { code: true, billing: true, amountNgn: true } });
        for (const row of rows) {
          const target = row.billing === "annual" ? PLAN_TIERS[next].defaults.annualNgn : PLAN_TIERS[next].defaults.monthlyNgn;
          await tx.subscriptionPlanVersion.update({ where: { code: row.code }, data: { tier: `${next}__moving`, ...(row.amountNgn !== target ? { current: false } : {}) } });
        }
      }
      for (const next of Object.values(LEGACY_TIERS)) {
        await tx.subscriptionPlanVersion.updateMany({ where: { tier: `${next}__moving` }, data: { tier: next } });
      }
      await tx.platformSetting.deleteMany({ where: { key: { in: Object.keys(LEGACY_TIERS).map((legacy) => `plan.${legacy}.credits`) } } });
    });
  } catch (error) {
    // Another server did it first (the flag key already exists).
    if ((error as { code?: string }).code !== "P2002") throw error;
  }
}

async function load(): Promise<PlanCatalog> {
  await migrateLegacyTiers();
  const [rows, settings] = await Promise.all([
    db.subscriptionPlanVersion.findMany({ select: { code: true, tier: true, billing: true, amountNgn: true, current: true } }),
    db.platformSetting.findMany({ where: { key: { in: PLAN_TIER_KEYS.map(creditsKey) } }, select: { key: true, value: true } }),
  ]);
  const known = rows.filter((row): row is typeof row & { tier: PlanTier; billing: PlanBilling } => row.tier in PLAN_TIERS && (row.billing === "monthly" || row.billing === "annual"));
  // Built-in codes the table doesn't have yet still count (before the migration, or a row removed by hand).
  const versions: PlanVersion[] = [
    ...known,
    ...BUILTIN_PLAN_VERSIONS.filter((builtin) => !known.some((row) => row.code === builtin.code)).map((builtin) => ({ ...builtin, current: builtin.current && builtin.amountNgn === defaultPrice(builtin.tier, builtin.billing) })),
  ];
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

/** What the billing pages sell today, per tier (plain JSON for client components). */
export async function planOffers(): Promise<Record<PlanTier, PlanOfferView>> {
  const { tiers } = await getPlanCatalog();
  return Object.fromEntries(PLAN_TIER_KEYS.map((tier) => [tier, view(tiers[tier])])) as Record<PlanTier, PlanOfferView>;
}

/** The price each tier and interval should be at: its current version's, else the October 2026 default. */
function targetPrice(catalog: PlanCatalog) {
  return (tier: PlanTier, billing: PlanBilling) => {
    if (!PLAN_TIERS[tier].billings.includes(billing)) return null;
    return catalog.tiers[tier][billing]?.amountNgn ?? defaultPrice(tier, billing);
  };
}

/** What "Apply the new prices" would do: amount changes on existing codes, and the tiers that need a new Paystack plan. */
export async function pendingPriceChanges() {
  const [catalog, subscribers] = await Promise.all([load(), subscribersByCode()]);
  const target = targetPrice(catalog);
  const moves = priceMoves(catalog.versions, target, subscribers);
  const missing: Array<{ tier: PlanTier; billing: PlanBilling; amountNgn: number; reuse: string | null }> = [];
  for (const tier of PLAN_TIER_KEYS) {
    for (const billing of PLAN_TIERS[tier].billings) {
      if (catalog.tiers[tier][billing]) continue;
      const amountNgn = target(tier, billing)!;
      // An old code of this tier and interval is moved to the new price and sold again, so its subscribers move too.
      const reuse = moves.find((move) => move.tier === tier && move.billing === billing && move.subscribers > 0)?.code ?? null;
      missing.push({ tier, billing, amountNgn, reuse });
    }
  }
  return { moves, missing };
}

/**
 * Puts everyone on today's prices: Paystack updates each old code's amount for its existing subscriptions (they pay
 * it from their next renewal), and tiers with nothing on sale get a plan (an old code moved, else a new one).
 */
export async function applyNewPrices(by: { userId: string; note?: string | null }) {
  const { moves, missing } = await pendingPriceChanges();
  const note = by.note?.trim().slice(0, 500) || "October 2026 prices";
  const now = new Date();
  const done: string[] = [];
  for (const move of moves) {
    await updatePaystackPlanAmount(move.code, move.toNgn * 100);
    await db.subscriptionPlanVersion.upsert({
      where: { code: move.code },
      create: { code: move.code, tier: move.tier, billing: move.billing, amountNgn: move.toNgn, current: false, createdById: by.userId },
      update: { amountNgn: move.toNgn },
    });
    await db.platformSettingChange.create({
      data: { key: priceKey(move.tier, move.billing), before: { amountNgn: move.fromNgn, code: move.code } as Prisma.InputJsonValue, after: { amountNgn: move.toNgn, code: move.code } as Prisma.InputJsonValue, note: `${note} (${move.subscribers} subscribed moved)`, changedById: by.userId },
    });
    done.push(`${PLAN_TIERS[move.tier].label} ${move.billing}: ${move.code} → ₦${move.toNgn.toLocaleString("en-NG")}`);
  }
  for (const gap of missing) {
    const code = gap.reuse ?? (await createPaystackPlan({ name: paystackPlanName(gap.tier, gap.billing, gap.amountNgn), amountKobo: gap.amountNgn * 100, interval: gap.billing === "annual" ? "annually" : "monthly", description: `Shopinbos ${note}` }));
    await db.$transaction([
      db.subscriptionPlanVersion.updateMany({ where: { tier: gap.tier, billing: gap.billing, current: true }, data: { current: false, retiredAt: now } }),
      db.subscriptionPlanVersion.upsert({
        where: { code },
        create: { code, tier: gap.tier, billing: gap.billing, amountNgn: gap.amountNgn, current: true, createdById: by.userId },
        update: { amountNgn: gap.amountNgn, current: true, retiredAt: null },
      }),
    ]);
    done.push(`${PLAN_TIERS[gap.tier].label} ${gap.billing}: now sold on ${code}`);
  }
  clearPlanCatalogCache();
  return done;
}
