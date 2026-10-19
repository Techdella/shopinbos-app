"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { savePrices } from "@/lib/pricing/price-book.server";
import { PRICE_KEYS } from "@shared/platform-pricing";

/** Admin › Pricing: saves one section's prices (fields are named by price key) with an optional note. */
export async function savePricing(formData: FormData) {
  const user = await requireRole(["admin"], "/admin/login");
  const input: Record<string, unknown> = {};
  for (const key of PRICE_KEYS) {
    const value = formData.get(key);
    if (typeof value === "string") input[key] = value;
  }
  const group = String(formData.get("group") ?? "");
  const result = await savePrices(input, { userId: user.id, note: String(formData.get("note") ?? "") });
  const back = (params: Record<string, string>) => `/admin/pricing?${new URLSearchParams(params).toString()}#${group}`;
  if (!result.ok) redirect(back({ error: result.error }));
  revalidatePath("/admin/pricing");
  redirect(back({ saved: String(result.changes.length) }));
}
