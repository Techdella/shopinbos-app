"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import type { PaymentMethodKey } from "@shared/onboarding";

const KEYS: PaymentMethodKey[] = ["transfer", "card", "cod", "wa"];

/** Saves which ways customers can pay (the same setting onboarding writes), leaving delivery zones alone. */
export async function savePaymentMethods(methods: Record<PaymentMethodKey, boolean>): Promise<{ error?: string }> {
  const user = await requireRole(["seller"], "/login");
  const clean = Object.fromEntries(KEYS.map((key) => [key, Boolean(methods?.[key])])) as Record<PaymentMethodKey, boolean>;
  if (!Object.values(clean).some(Boolean)) return { error: "Keep at least one way for customers to pay." };

  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, brandSettings: true } });
  if (!store) return { error: "Store not found." };
  const settings = (store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings) ? store.brandSettings : {}) as Record<string, unknown>;
  const paymentConfig = (settings.paymentConfig && typeof settings.paymentConfig === "object" ? settings.paymentConfig : {}) as Record<string, unknown>;

  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...settings, paymentConfig: { ...paymentConfig, methods: clean } } as Prisma.InputJsonValue },
  });
  revalidatePath("/home/payments");
  return {};
}
