import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Marks zones created by onboarding (inside the rate data, so it never affects region matching at checkout).
const ONBOARDING_SOURCE = "onboarding";

const Body = z.object({
  methods: z.object({ transfer: z.boolean(), card: z.boolean(), cod: z.boolean(), wa: z.boolean() }),
  zones: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        fee: z.number().int().min(0).max(1_000_000),
        regions: z.array(z.string().trim().min(2).max(60)).max(30),
        priority: z.number().int().min(0).max(100),
      }),
    )
    .max(12),
});

// Saves the "Getting paid and delivering" onboarding step: payment preferences and flat delivery fees.
// Zones created here are tagged so re-running the step replaces them instead of piling up duplicates.
// Checkout uses the first matching zone by sortOrder, so catch-all zones (no regions) always go last.
export const PUT = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your payment and delivery settings.");
  const { methods, zones } = parsed.data;
  if (!Object.values(methods).some(Boolean)) return apiError("BAD_REQUEST", "Turn on at least one way for customers to pay.");

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const settings = (store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? store.brandSettings : {}) as Record<string, unknown>;
  const paymentConfig = (settings.paymentConfig && typeof settings.paymentConfig === "object" ? settings.paymentConfig : {}) as Record<string, unknown>;

  const existing = await db.shippingZone.findMany({ where: { storeId: store.id }, select: { id: true, rates: true } });
  const previousOnboardingZones = existing
    .filter((zone) => Array.isArray(zone.rates) && zone.rates.some((rate) => (rate as { source?: string } | null)?.source === ONBOARDING_SOURCE))
    .map((zone) => zone.id);
  const ordered = [...zones].sort((a, b) => (a.regions.length === 0 ? 1 : 0) - (b.regions.length === 0 ? 1 : 0) || a.priority - b.priority);

  await db.$transaction([
    db.store.update({
      where: { id: store.id },
      data: { brandSettings: { ...settings, paymentConfig: { ...paymentConfig, methods } } },
    }),
    db.shippingZone.deleteMany({ where: { id: { in: previousOnboardingZones } } }),
    ...ordered.map((zone, index) =>
      db.shippingZone.create({
        data: {
          storeId: store.id,
          name: zone.name,
          type: "flat_rate",
          regions: zone.regions,
          rates: [{ name: "Standard delivery", minValue: 0, minWeight: 0, price: zone.fee, source: ONBOARDING_SOURCE }],
          sortOrder: index,
          active: true,
        },
      }),
    ),
  ]);

  return ok({ methods, zones });
});
