"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { switchSettings } from "@shared/order-parts";

// Settings › Store › "When a supplier doesn't accept in time": send it to another supplier automatically (on by
// default), and the most a switch may cost.
export async function saveSupplierSwitchSettings(formData: FormData) {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) redirect("/builder?firstRun=1");
  const settings = switchSettings({
    autoSwitchSupplier: formData.get("auto") === "on",
    switchCostRule: String(formData.get("rule") ?? "cost"),
    switchMaxIncreasePct: Number(formData.get("maxIncreasePct") ?? 10),
    switchMinMarginPct: Number(formData.get("minMarginPct") ?? 20),
  });
  await db.store.update({
    where: { id: store.id },
    data: { autoSwitchSupplier: settings.auto, switchCostRule: settings.rule, switchMaxIncreasePct: settings.maxIncreasePct, switchMinMarginPct: settings.minMarginPct },
  });
  revalidatePath("/home/settings");
  redirect("/home/settings?saved=true&tab=Store#supplier-switch");
}
