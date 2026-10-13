"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { deliveryAreasFromPicks, isSetupStepKey, type SetupChoicePatch } from "@/lib/setup/checklist";
import { replaceSetupDeliveryAreas, saveSetupChoice, setPaymentMethods, SetupError } from "@/lib/setup/server";
import type { PaymentMethodKey } from "@shared/onboarding";
import { getT } from "@/lib/i18n/server";

// Start here's inline steps. Each one writes the same data the full settings screens do, so the checklist ticks
// itself from real state.

type Result = { error?: string };

async function storeOf(userId: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) throw new SetupError("Store not found.");
  return store;
}

async function run(work: () => Promise<unknown>): Promise<Result> {
  try {
    await work();
    revalidatePath("/home/start");
    revalidatePath("/home");
    return {};
  } catch (error) {
    if (error instanceof SetupError) return { error: error.message };
    console.error("[start-here]", error);
    return { error: (await getT("home"))("start.saveFailed") };
  }
}

// requireRole runs outside run(): its redirect must not be caught as an error.

export async function chooseSetupStep(type: SetupChoicePatch["type"], key?: string): Promise<Result> {
  const user = await requireRole(["seller"], "/login");
  return run(async () => {
    if (type === "skip" || type === "unskip") {
      if (!isSetupStepKey(key)) throw new SetupError("That step can't be skipped.");
      await saveSetupChoice(user.id, { type, key });
    } else if (type === "dismiss" || type === "reopen" || type === "shared") {
      await saveSetupChoice(user.id, { type });
    }
  });
}

export async function savePaymentChoices(methods: Record<PaymentMethodKey, boolean>): Promise<Result> {
  const user = await requireRole(["seller"], "/login");
  return run(async () => {
    const store = await storeOf(user.id);
    await setPaymentMethods(store.id, {
      transfer: Boolean(methods?.transfer),
      card: Boolean(methods?.card),
      cod: Boolean(methods?.cod),
      wa: Boolean(methods?.wa),
    });
  });
}

export async function saveDeliveryPicks(picks: Array<{ city: string; fee: number }>, elsewhereFee: number | null): Promise<Result> {
  const user = await requireRole(["seller"], "/login");
  return run(async () => {
    const store = await storeOf(user.id);
    const list = Array.isArray(picks) ? picks.slice(0, 20).map((pick) => ({ city: String(pick?.city ?? ""), fee: Number(pick?.fee) })) : [];
    if (list.some((pick) => !Number.isFinite(pick.fee) || pick.fee < 0 || pick.fee > 1_000_000)) throw new SetupError("Delivery fees must be between ₦0 and ₦1,000,000.");
    const fee = elsewhereFee === null ? null : Number(elsewhereFee);
    if (fee !== null && (!Number.isFinite(fee) || fee < 0 || fee > 1_000_000)) throw new SetupError("Delivery fees must be between ₦0 and ₦1,000,000.");
    await replaceSetupDeliveryAreas(store.id, deliveryAreasFromPicks(list, fee));
  });
}
