"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import type { PaymentMethodKey } from "@shared/onboarding";
import { TRANSFER_WINDOW_CHOICES } from "@shared/checkout-payments";
import { getT } from "@/lib/i18n/server";

const KEYS: PaymentMethodKey[] = ["transfer", "card", "cod", "wa"];

/** Saves which ways customers can pay (the same setting onboarding writes), leaving delivery zones alone. */
export async function savePaymentMethods(methods: Record<PaymentMethodKey, boolean>): Promise<{ error?: string }> {
  const user = await requireRole(["seller"], "/login");
  const clean = Object.fromEntries(KEYS.map((key) => [key, Boolean(methods?.[key])])) as Record<PaymentMethodKey, boolean>;
  const t = await getT("payments");
  if (!Object.values(clean).some(Boolean)) return { error: t("err.keepOne") };

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return { error: t("err.noStore") };
  const settings = (store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? store.brandSettings : {}) as Record<string, unknown>;
  const paymentConfig = (settings.paymentConfig && typeof settings.paymentConfig === "object" ? settings.paymentConfig : {}) as Record<string, unknown>;

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...settings, paymentConfig: { ...paymentConfig, methods: clean } } as Prisma.InputJsonValue },
  });
  revalidatePath("/home/payments");
  return {};
}

/**
 * How long buyers who chose bank transfer have to pay before the order lets its items go (hours), or null for the
 * Shopinbos default. Applies to orders placed from now on; each order keeps the deadline it was given.
 */
export async function saveTransferWindow(hours: number | null): Promise<{ error?: string }> {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("payments");
  if (hours !== null && !(TRANSFER_WINDOW_CHOICES as readonly number[]).includes(hours)) return { error: t("err.chooseTime") };

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return { error: t("err.noStore") };
  const settings = (store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? store.brandSettings : {}) as Record<string, unknown>;
  const paymentConfig = (settings.paymentConfig && typeof settings.paymentConfig === "object" ? settings.paymentConfig : {}) as Record<string, unknown>;
  const { transferWindowHours: _previous, ...rest } = paymentConfig;
  void _previous;

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...settings, paymentConfig: hours === null ? rest : { ...rest, transferWindowHours: hours } } as Prisma.InputJsonValue },
  });
  revalidatePath("/home/payments");
  return {};
}
