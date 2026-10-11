import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const ONBOARDING_ZONE_TAG = "onboarding";

const Body = z.object({
  methods: z.object({ transfer: z.boolean(), card: z.boolean(), cod: z.boolean(), wa: z.boolean() }),
  zones: z
    .array(z.object({ name: z.string().trim().min(2).max(80), fee: z.number().int().min(0).max(1_000_000), maxFee: z.number().int().min(0).max(1_000_000).optional() }))
    .max(12),
});

// Saves the "Getting paid and delivering" onboarding step: payment preferences and flat delivery fees.
// Zones created here are tagged so re-running the step replaces them instead of piling up duplicates.
export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your payment and delivery settings.");
  const { methods, zones } = parsed.data;
  if (!Object.values(methods).some(Boolean)) return apiError("BAD_REQUEST", "Turn on at least one way for customers to pay.");

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const settings = (store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? store.brandSettings : {}) as Record<string, unknown>;
  const paymentConfig = (settings.paymentConfig && typeof settings.paymentConfig === "object" ? settings.paymentConfig : {}) as Record<string, unknown>;

  await db.$transaction([
    db.store.update({
      where: { id: store.id },
      data: { brandSettings: { ...settings, paymentConfig: { ...paymentConfig, methods } } },
    }),
    db.shippingZone.deleteMany({ where: { storeId: store.id, regions: { has: ONBOARDING_ZONE_TAG } } }),
    ...zones.map((zone, index) =>
      db.shippingZone.create({
        data: {
          storeId: store.id,
          name: zone.name,
          type: "flat_rate",
          regions: [zone.name, ONBOARDING_ZONE_TAG],
          rates: [{ name: "Standard delivery", minValue: 0, minWeight: 0, price: zone.fee, ...(zone.maxFee ? { maxPrice: zone.maxFee } : {}) }],
          sortOrder: index,
          active: true,
        },
      }),
    ),
  ]);

  return ok({ methods, zones });
});
