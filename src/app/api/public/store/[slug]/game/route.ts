import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { readGameConfig, sliceLabel, sliceOdds } from "@/lib/gamification/logic";

// The store's games as shoppers see them (for the website and apps; the storefront reads the same settings
// from the public store payload): which games are on, the prizes with their odds, reward tiers and how
// points work. No personal data.

const CORS = { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true, brandSettings: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  const config = readGameConfig(record(store.brandSettings).gamification ?? {});
  const odds = sliceOdds(config.prizes.slices);
  const popup = (settings: typeof config.wheel) => ({
    enabled: settings.enabled,
    trigger: settings.trigger,
    delaySeconds: settings.delaySeconds,
    scrollPercent: settings.scrollPercent,
    frequencyDays: settings.frequencyDays,
    collect: settings.collect,
    headline: settings.headline,
    body: settings.body,
  });
  const res = withCors(req, ok({
    wheel: popup(config.wheel),
    scratch: popup(config.scratch),
    prizes: {
      slices: config.prizes.slices.map((slice, index) => ({ id: slice.id, kind: slice.kind, label: sliceLabel(slice), odds: odds[index] })),
      codeDays: config.prizes.codeDays,
      minOrder: config.prizes.minOrder,
    },
    progress: config.progress,
    loyalty: config.loyalty.enabled
      ? {
          enabled: true,
          pointsPer100: config.loyalty.pointsPer100,
          pointValue: config.loyalty.pointValue,
          maxRedeemPercent: config.loyalty.maxRedeemPercent,
          minRedeemPoints: config.loyalty.minRedeemPoints,
          tiers: [
            { tier: "bronze", from: 0, multiplier: 1, perk: "" },
            { tier: "silver", from: config.loyalty.silverAt, multiplier: config.loyalty.silverMultiplier, perk: config.loyalty.silverPerk },
            { tier: "gold", from: config.loyalty.goldAt, multiplier: config.loyalty.goldMultiplier, perk: config.loyalty.goldPerk },
          ],
        }
      : { enabled: false },
    postPurchase: config.postPurchase,
  }), CORS);
  res.headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return res;
}
