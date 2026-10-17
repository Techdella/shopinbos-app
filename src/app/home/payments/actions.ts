"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import type { PaymentMethodKey } from "@shared/onboarding";
import { saveSellerPaymentBadges, saveSellerPaymentMethods, saveSellerTransferWindow } from "@/lib/seller-payments.server";
import { getT } from "@/lib/i18n/server";

// The rules live in src/lib/seller-payments.server.ts, shared with /api/app/payments (the phone app).

/** Saves which ways customers can pay (the same setting onboarding writes), leaving delivery zones alone. */
export async function savePaymentMethods(methods: Record<PaymentMethodKey, boolean>): Promise<{ error?: string }> {
  const user = await requireRole(["seller"], "/login");
  const result = await saveSellerPaymentMethods(user.id, methods);
  if (result.error) return { error: (await getT("payments"))(`err.${result.error}`) };
  revalidatePath("/home/payments");
  return {};
}

/**
 * How long buyers who chose bank transfer have to pay before the order lets its items go (hours), or null for the
 * Shopinbos default. Applies to orders placed from now on; each order keeps the deadline it was given.
 */
export async function saveTransferWindow(hours: number | null): Promise<{ error?: string }> {
  const user = await requireRole(["seller"], "/login");
  const result = await saveSellerTransferWindow(user.id, hours);
  if (result.error) return { error: (await getT("payments"))(`err.${result.error}`) };
  revalidatePath("/home/payments");
  return {};
}

/** Which payment logos the store shows shoppers (footer and checkout). An empty list shows none. */
export async function savePaymentBadges(badges: string[]): Promise<{ error?: string }> {
  const user = await requireRole(["seller"], "/login");
  const result = await saveSellerPaymentBadges(user.id, badges);
  if (result.error) return { error: (await getT("payments"))(`err.${result.error}`) };
  revalidatePath("/home/payments");
  return {};
}
