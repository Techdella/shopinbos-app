"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { confirmDeliveryFeePayment, startDeliveryFeePayment } from "@/lib/logistics/delivery-fee-payments.server";

// A seller pays a delivery partner's fee by card, split straight to the partner's bank; Shopinbos never holds it
// (src/lib/logistics/delivery-fee-payments.server.ts).

export async function startDeliveryFeePaymentAction(bookingId: string) {
  const user = await requireRole(["seller"], "/login");
  return startDeliveryFeePayment({ id: user.id, email: user.email ?? null }, String(bookingId).slice(0, 40));
}

export async function confirmDeliveryFeePaymentAction(reference: string) {
  const user = await requireRole(["seller"], "/login");
  const result = await confirmDeliveryFeePayment(String(reference).slice(0, 60), user.id);
  revalidatePath("/home/logistics");
  return result;
}
