import "server-only";

import crypto from "node:crypto";
import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { themeLibraryEntry, themeTier } from "@/lib/store-templates/theme-library";
import { THEME_REFERENCE_PREFIX, isBuyableTier, themePriceNaira } from "@shared/theme-purchase";

// Buying one premium or platinum theme instead of upgrading the plan (rules in shared/theme-purchase.ts).
//
//   gallery "Buy" → startThemeCheckout → Paystack → completeThemePurchase (callback or webhook, either order, any
//   number of times): verified like the other Paystack payments, then ONE caller moves the row pending → paid.
//   From then on ownedThemeIds includes the theme and the theme switch checks (src/lib/theme-access.ts) let it through.

export class ThemePurchaseError extends Error {}

/** Today's price of one theme per tier, in naira (Admin › Pricing). */
export async function themePrices() {
  const book = await getPriceBook();
  return { premium: themePriceNaira("premium", book)!, platinum: themePriceNaira("platinum", book)! };
}

/**
 * Themes the seller has bought. Empty when the purchases table isn't there yet (before
 * docs/migrations/2026-11-16-theme-purchases.sql runs), so theme access keeps working on the plan alone.
 */
export async function ownedThemeIds(userId: string): Promise<string[]> {
  try {
    const rows = await db.themePurchase.findMany({ where: { userId, status: "paid" }, select: { themeId: true } });
    return [...new Set(rows.map((row) => row.themeId))];
  } catch (error) {
    console.error("[themes] couldn't read theme purchases", error instanceof Error ? error.message : error);
    return [];
  }
}

/** Starts a Paystack checkout for one theme; returns the page to send the seller to. */
export async function startThemeCheckout(input: { user: { id: string; email: string | null }; themeId: string; origin: string; returnTo: string }) {
  const theme = themeLibraryEntry(input.themeId);
  if (!theme) throw new ThemePurchaseError("Choose one of the themes in the gallery.");
  const tier = themeTier(theme.id);
  if (!isBuyableTier(tier)) throw new ThemePurchaseError(`${theme.name} is free on every plan.`);
  if ((await ownedThemeIds(input.user.id)).includes(theme.id)) throw new ThemePurchaseError(`You already own ${theme.name}.`);
  const naira = (await themePrices())[tier];
  const amountKobo = naira * 100;
  const reference = `${THEME_REFERENCE_PREFIX}${crypto.randomUUID()}`;
  await db.themePurchase.create({ data: { reference, userId: input.user.id, themeId: theme.id, tier, amountKobo } });
  const callbackUrl = new URL("/api/store/templates/purchase/callback", input.origin);
  callbackUrl.searchParams.set("returnTo", input.returnTo);
  const session = await initializePaystackTransaction({
    email: billingEmail(input.user),
    amountKobo,
    reference,
    callbackUrl: callbackUrl.toString(),
    metadata: { purpose: "theme_purchase", user_id: input.user.id, theme_id: theme.id, tier },
  });
  return { authorizationUrl: session.authorization_url, reference };
}

/**
 * Marks a verified theme purchase paid, once. Safe to call from the callback and the webhook at the same time.
 * Returns the theme with "paid" when it's (now or already) the seller's, "failed" when Paystack says it didn't go
 * through, "pending" while Paystack is still working on it.
 */
export async function completeThemePurchase(reference: string): Promise<{ status: "paid" | "failed" | "pending"; themeId: string }> {
  const row = await db.themePurchase.findUnique({ where: { reference } });
  if (!row) throw new ThemePurchaseError("We couldn't find that theme purchase.");
  if (row.status === "paid") return { status: "paid", themeId: row.themeId };
  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== "success") {
    if (verified.status === "failed" || verified.status === "abandoned" || verified.status === "reversed") {
      await db.themePurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "failed", error: `Paystack: ${verified.status}` } });
      return { status: "failed", themeId: row.themeId };
    }
    return { status: "pending", themeId: row.themeId };
  }
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { id: true, email: true } });
  const metadata = (verified.metadata ?? {}) as Record<string, unknown>;
  const customer = verified.customer?.email?.toLowerCase() ?? null;
  if (
    !user ||
    verified.currency !== "NGN" ||
    Number(verified.amount) !== row.amountKobo ||
    metadata.purpose !== "theme_purchase" ||
    metadata.user_id !== row.userId ||
    metadata.theme_id !== row.themeId ||
    customer !== billingEmail(user)
  ) {
    await db.themePurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "failed", error: "Payment details didn't match" } });
    throw new ThemePurchaseError("That payment doesn't match this theme purchase. Contact support if you were charged.");
  }
  await db.themePurchase.updateMany({ where: { reference, status: "pending" }, data: { status: "paid", paidAt: new Date(), error: null } });
  return { status: "paid", themeId: row.themeId };
}
