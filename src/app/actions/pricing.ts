"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { savePrices } from "@/lib/pricing/price-book.server";
import { cancelPromotion, createPromotion, PromotionError, updatePromotion } from "@/lib/pricing/promotions.server";
import { cleanPriceValue, PRICE_KEYS, PRICE_SETTINGS } from "@shared/platform-pricing";
import { fromLagosInput, PROMO_AUDIENCES, type PromoInput } from "@shared/price-promotions";

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

function promoInput(formData: FormData): PromoInput {
  const prices: PromoInput["prices"] = {};
  for (const key of PRICE_KEYS) {
    const raw = formData.get(`p:${key}`);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const value = cleanPriceValue(key, raw);
    if (value === null) throw new PromotionError(`${PRICE_SETTINGS[key].label}: that value isn't allowed.`);
    prices[key] = value;
  }
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  return {
    name: text("name").slice(0, 120),
    headline: text("headline").slice(0, 160),
    message: text("message").slice(0, 1000) || null,
    startsAt: fromLagosInput(text("startsAt")),
    endsAt: fromLagosInput(text("endsAt")),
    audience: PROMO_AUDIENCES.map((a) => a.key).filter((key) => formData.get(`audience:${key}`) === "on"),
    prices,
    announceEmail: formData.get("announceEmail") === "on",
    announceNotice: formData.get("announceNotice") === "on",
  };
}

export interface PromoFormState {
  error: string | null;
  /** What was submitted, so the form keeps it after an error. */
  values: Record<string, string> | null;
  /** Bumped on every error so the form shows the submitted values again. */
  attempt: number;
}

/** Admin › Pricing › Promotions: creates a promotion, or edits one that hasn't started (`id`). */
export async function savePromotion(previous: PromoFormState, formData: FormData): Promise<PromoFormState> {
  const user = await requireRole(["admin"], "/admin/login");
  const id = String(formData.get("id") ?? "") || null;
  try {
    const input = promoInput(formData);
    if (id) await updatePromotion(id, input, user.id);
    else await createPromotion(input, user.id);
  } catch (error) {
    if (!(error instanceof PromotionError)) throw error;
    const values: Record<string, string> = {};
    for (const [key, value] of formData.entries()) if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
    return { error: error.message, values, attempt: previous.attempt + 1 };
  }
  revalidatePath("/admin/pricing/promotions");
  redirect(`/admin/pricing/promotions?${new URLSearchParams({ saved: id ? "Promotion updated." : "Promotion scheduled." }).toString()}`);
}

/** Cancels an upcoming promotion, or ends a live one now. */
export async function endPromotion(formData: FormData) {
  await requireRole(["admin"], "/admin/login");
  const promo = await cancelPromotion(String(formData.get("id") ?? ""));
  revalidatePath("/admin/pricing/promotions");
  redirect(`/admin/pricing/promotions?${new URLSearchParams({ saved: promo.status === "cancelled" ? "Promotion cancelled." : "Promotion ended: prices are back to normal." }).toString()}`);
}
