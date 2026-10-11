import "server-only";

import { db } from "@/lib/db/client";
import { readTransferAccount } from "@shared/checkout-payments";
import type { TransferDetails } from "./TransferInstructions";

const UNPAID = ["pending", "awaiting_payment"];

/**
 * What the buyer needs next for their order: account details for an unpaid transfer, and the delivery code
 * to give the rider once a delivery is booked. Also trims brandSettings to the look, so payout details stay
 * on the server.
 */
export async function loadOrderNextSteps(
  order: { id: string; orderNumber: string; total: number; status: string; paymentMethod: string | null },
  store: { userId: string; brandSettings: unknown },
): Promise<{ transfer: TransferDetails | null; deliveryCode: string | null; brandSettings: { palette?: Record<string, string> } }> {
  const account = order.paymentMethod === "transfer" && UNPAID.includes(order.status) ? readTransferAccount(store.brandSettings) : null;
  const booking = await db.deliveryBooking.findFirst({
    where: { orderId: order.id, sellerId: store.userId, deliveryCode: { not: null }, status: { notIn: ["cancelled", "delivered", "failed"] } },
    orderBy: { createdAt: "desc" },
    select: { deliveryCode: true },
  });
  const settings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? (store.brandSettings as Record<string, unknown>) : {};
  const palette = settings.palette && typeof settings.palette === "object" ? (settings.palette as Record<string, string>) : undefined;
  return {
    transfer: account ? { ...account, amount: order.total, reference: order.orderNumber } : null,
    deliveryCode: booking?.deliveryCode ?? null,
    brandSettings: palette ? { palette } : {},
  };
}
