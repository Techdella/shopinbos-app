import { NextRequest } from "next/server";
import { payOnDeliveryAllowed, payOnDeliveryPlanName } from "@/lib/plans/gates.server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { mergePaymentMethods } from "@shared/onboarding";

export const dynamic = "force-dynamic";

// Marks zones created by onboarding (inside the rate data, so it never affects region matching at checkout).
const ONBOARDING_SOURCE = "onboarding";

const Body = z.object({
  // Korapay is optional: the step may not show it, and a choice it doesn't send keeps what the seller saved.
  methods: z.object({ transfer: z.boolean(), card: z.boolean(), korapay: z.boolean().optional(), cod: z.boolean(), wa: z.boolean() }),
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

// Pay on delivery a seller already had stays on after a downgrade.
const savedCod = (paymentConfig: Record<string, unknown>) => (paymentConfig.methods as { cod?: unknown } | undefined)?.cod === true;

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
  // Onboarding ticks pay on delivery by default; on plans without it, it's left off unless it's the only choice.
  if (methods.cod && !savedCod(paymentConfig) && !(await payOnDeliveryAllowed(user.id))) {
    if (!methods.transfer && !methods.card && !methods.wa) return apiError("PLAN_LIMIT", `Pay on delivery comes with the ${payOnDeliveryPlanName()} plan. Pick another way for customers to pay.`, 402);
    methods.cod = false;
  }
  // Merged with the saved choices so a key this step doesn't send (Korapay, from the Money page) isn't wiped.
  const saved = mergePaymentMethods(paymentConfig.methods, methods);
  const ordered = [...zones].sort((a, b) => (a.regions.length === 0 ? 1 : 0) - (b.regions.length === 0 ? 1 : 0) || a.priority - b.priority);

  await db.$transaction([
    db.store.update({
      where: { id: store.id },
      data: { brandSettings: { ...settings, paymentConfig: { ...paymentConfig, methods: saved } } },
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

  return ok({ methods: saved, zones });
});
