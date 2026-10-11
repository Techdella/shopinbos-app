import "server-only";

import { db } from "@/lib/db/client";
import { checkoutPaymentSettings, paystackSecretReady, type CheckoutPaymentSettings, type FeeZone } from "@shared/checkout-payments";

/**
 * Payment options and delivery-fee zones for the checkout page, from the same settings the checkout API
 * enforces. The payout account number is not included; buyers only see it after placing a transfer order.
 */
export async function loadCheckoutPayments(slug: string): Promise<{ payments: CheckoutPaymentSettings; feeZones: FeeZone[] }> {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, brandSettings: true } });
  const zones = store
    ? await db.shippingZone.findMany({
        where: { storeId: store.id, active: true },
        orderBy: { sortOrder: "asc" },
        select: { name: true, regions: true, rates: true },
      })
    : [];
  return {
    payments: checkoutPaymentSettings(store?.brandSettings, zones, paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)),
    feeZones: zones.map((zone) => ({ regions: zone.regions, rates: JSON.parse(JSON.stringify(zone.rates ?? [])) })),
  };
}
