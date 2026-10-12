import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { GAME_CODE_PREFIXES, prizeDiscount, readGameConfig, tierLabel, type GamificationConfig } from "./logic";

// Reading and saving the rewards settings (Store.brandSettings.gamification) and keeping the reward tiers'
// automatic discounts in step with them, so a "₦1,000 off at ₦30,000" tier is honoured by the checkout's
// existing automatic-discount rules (src/lib/commerce/pricing.server.ts) without any new pricing code.

export class GameError extends Error {}

/** Prisma's "table/column doesn't exist" (the gamification SQL hasn't been applied yet). */
export function isMissingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022" || /does not exist|relation .* does not exist/i.test(String((error as Error | null)?.message ?? ""));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function loadGameConfig(storeId: string): Promise<GamificationConfig> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  return readGameConfig(record(store?.brandSettings).gamification ?? {});
}

/** Saves the settings into brandSettings (other keys untouched) and syncs the tier discounts. */
export async function saveGameConfig(storeId: string, config: GamificationConfig) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  if (!store) throw new GameError("Store not found");
  const latest = record(store.brandSettings);
  const before = readGameConfig(latest.gamification ?? {});
  const clean = readGameConfig(config);
  // Points start counting the moment they're first switched on (orders before that don't earn).
  clean.loyalty.startedAt = clean.loyalty.enabled ? before.loyalty.startedAt ?? new Date().toISOString() : before.loyalty.startedAt;
  await db.store.update({ where: { id: storeId }, data: { brandSettings: { ...latest, gamification: clean } as unknown as Prisma.InputJsonValue } });
  await syncTierDiscounts(storeId, clean);
  return clean;
}

const tierCode = (id: string) => `${GAME_CODE_PREFIXES.tier}-${id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16)}`;

/**
 * One automatic Discount per reward tier (code TIER-<id>): active while the progress bar is on, with the tier's
 * amount as the minimum order. Tiers that were removed are switched off (kept, so past orders still name them).
 */
export async function syncTierDiscounts(storeId: string, config: GamificationConfig) {
  const tiers = config.progress.tiers;
  const giftIds = tiers.map((tier) => tier.productId).filter((id): id is string => Boolean(id));
  const gifts = giftIds.length
    ? await db.storeProduct.findMany({ where: { storeId, id: { in: giftIds } }, select: { id: true, name: true, retailPrice: true } })
    : [];
  const giftById = new Map(gifts.map((gift) => [gift.id, gift]));
  const wanted = new Set<string>();
  for (const tier of tiers) {
    const gift = tier.productId ? giftById.get(tier.productId) : undefined;
    const prize = prizeDiscount(tier, gift?.retailPrice ?? null);
    if (!prize) continue;
    const code = tierCode(tier.id);
    wanted.add(code);
    const data = {
      name: `Reward at ₦${tier.threshold.toLocaleString("en-NG")}: ${tierLabel(tier, gift?.name)}`.slice(0, 120),
      type: prize.type,
      value: prize.value,
      minOrder: tier.threshold,
      maxUses: 0,
      status: config.progress.enabled ? ("active" as const) : ("disabled" as const),
      config: { automatic: true, productIds: prize.productIds, game: { kind: "tier", tierId: tier.id } } as unknown as Prisma.InputJsonValue,
    };
    await db.discount.upsert({ where: { storeId_code: { storeId, code } }, create: { storeId, code, ...data }, update: data });
  }
  await db.discount.updateMany({
    where: { storeId, code: { startsWith: `${GAME_CODE_PREFIXES.tier}-`, notIn: [...wanted] }, status: "active" },
    data: { status: "disabled" },
  });
}
