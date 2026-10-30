import "server-only";

import { db } from "@/lib/db/client";
import { chargePaystackAuthorization, initializePaystackTransaction, verifyPaystackTransaction, type PaystackVerification } from "@/lib/paystack";
import { openSecret, sealSecret } from "@/lib/reviews/secrets";
import { paystackSecretReady } from "@shared/checkout-payments";
import { buildSplitPlan, paystackSplitParams, platformFeeKobo, type PaymentSplitPlan } from "@/lib/wallet/rules";
import { platformFee } from "@/lib/wallet/wallet.server";
import { GROUP_VERIFY_KOBO } from "@shared/group-buy";

// Every Paystack call for Pay small small, ajo and group buy (src/lib/pay-together). One rule: SHOPINBOS NEVER HOLDS
// MONEY. Each payment is one Paystack transaction split at the moment it's paid: the whole amount less Shopinbos's
// fee settles to the seller's own Paystack subaccount (their own bank), and the fee is the split's transaction_charge,
// exactly like store checkout (src/lib/wallet/rules.ts buildSplitPlan → paystackSplitParams). The same split goes on
// charges of a saved card (charge_authorization with subaccount + transaction_charge).
//
// Group buy's card check (GROUP_VERIFY_KOBO, ₦50) saves a shopper's card and is split to the seller too (no fee):
// Shopinbos never receives it. It's taken off the group price when the group fills, or the shop sends it back.

export function paymentsReady() {
  return paystackSecretReady(process.env.PAYSTACK_SECRET_KEY);
}

/** The seller's live Paystack subaccount (wallet active, KYC verified, bank name checked), or null. */
export async function sellerSubaccount(storeId: string): Promise<{ sellerUserId: string; subaccount: string } | null> {
  // Subaccounts made on the other key mode (test/live) are made again first, once (as checkout does).
  await (await import("@/lib/paystack-mode.server")).ensurePaystackModeSynced();
  const store = await db.store.findUnique({ where: { id: storeId }, select: { userId: true } });
  if (!store) return null;
  const wallet = await db.wallet.findFirst({ where: { userId: store.userId, status: "active", subaccountStatus: "active", subaccountCode: { not: null } }, select: { subaccountCode: true } });
  return wallet?.subaccountCode ? { sellerUserId: store.userId, subaccount: wallet.subaccountCode } : null;
}

/** Shopinbos's fee on a sale of `goodsKobo` for this seller's plan (Admin › Pricing), the same as store checkout. */
export async function saleFeeKobo(sellerUserId: string, goodsKobo: number): Promise<number> {
  return platformFeeKobo(goodsKobo, await platformFee(sellerUserId));
}

/**
 * The split for one payment: everything to the seller's subaccount except `feeKobo` (Shopinbos's part of its fee),
 * which buildSplitPlan lowers if needed so the seller always keeps at least ₦100. No suppliers: these features are for
 * the seller's own products only (dropship products need the supplier in the split, which a saved-card charge can't do).
 */
export function sellerSplit(subaccount: string, amountKobo: number, feeKobo: number): PaymentSplitPlan {
  return buildSplitPlan({ totalKobo: amountKobo, sellerSubaccount: subaccount, suppliers: [], platformKobo: feeKobo });
}

/** The single-subaccount form charge_authorization takes (and initialize, through paystackSplitParams). */
function singleSplit(plan: PaymentSplitPlan): { subaccount: string; transaction_charge: number; bearer: string } {
  const params = paystackSplitParams(plan);
  if (typeof params.subaccount !== "string") throw new Error("A saved-card charge can only settle to one business.");
  return { subaccount: params.subaccount, transaction_charge: Number(params.transaction_charge ?? 0), bearer: String(params.bearer ?? "subaccount") };
}

/** Starts a Paystack checkout for one split payment. `cardOnly` when the card must be saved for later charges. */
export async function startSplitPayment(input: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, unknown>; plan: PaymentSplitPlan; cardOnly?: boolean }) {
  if (input.plan.totalKobo !== Math.round(input.amountKobo)) throw new Error("The split doesn't match the amount.");
  const started = await initializePaystackTransaction({
    email: input.email,
    amountKobo: input.amountKobo,
    reference: input.reference,
    callbackUrl: input.callbackUrl,
    metadata: input.metadata,
    split: paystackSplitParams(input.plan),
    ...(input.cardOnly ? { channels: ["card"] } : {}),
  });
  return { authorizationUrl: started.authorization_url!, accessCode: started.access_code ?? null, reference: started.reference ?? input.reference };
}

/**
 * Charges a saved card for one split payment (autopay, a group that filled). Returns Paystack's status: only
 * "success" is a payment, and it's still verified (confirm*) before anything is recorded.
 */
export async function chargeSavedCard(input: { email: string; sealedAuthorization: string; amountKobo: number; reference: string; metadata: Record<string, unknown>; plan: PaymentSplitPlan }) {
  const authorizationCode = openSecret(input.sealedAuthorization);
  if (!authorizationCode) return { status: "failed", message: "The saved card can't be read." };
  if (input.plan.totalKobo !== Math.round(input.amountKobo)) return { status: "failed", message: "The split doesn't match the amount." };
  return chargePaystackAuthorization({
    email: input.email,
    amountKobo: input.amountKobo,
    authorizationCode,
    reference: input.reference,
    metadata: input.metadata,
    split: singleSplit(input.plan),
  });
}

/** Asks Paystack about a payment (never trust the browser or the webhook body). Throws when Paystack can't answer. */
export function verifyPayment(reference: string): Promise<PaystackVerification> {
  return verifyPaystackTransaction(reference);
}

/** Group buy: a ₦50 card check (card only) that saves the shopper's card, split to the seller's subaccount (no fee). */
export async function startCardCheck(input: { email: string; reference: string; callbackUrl: string; metadata: Record<string, unknown>; subaccount: string }) {
  const plan = sellerSplit(input.subaccount, GROUP_VERIFY_KOBO, 0);
  const started = await initializePaystackTransaction({
    email: input.email,
    amountKobo: GROUP_VERIFY_KOBO,
    reference: input.reference,
    callbackUrl: input.callbackUrl,
    metadata: { ...input.metadata, purpose: "card_check" },
    split: paystackSplitParams(plan),
    channels: ["card"],
  });
  return { authorizationUrl: started.authorization_url!, accessCode: started.access_code ?? null, reference: started.reference ?? input.reference };
}

/** Paystack's reusable authorization code, sealed for storage (a token, not card data). Null when not reusable. */
export function sealAuthorization(verification: Pick<PaystackVerification, "authorization">): { code: string; last4: string | null } | null {
  const auth = verification.authorization;
  if (!auth || auth.reusable !== true || typeof auth.authorization_code !== "string" || !auth.authorization_code) return null;
  const code = sealSecret(auth.authorization_code);
  return code ? { code, last4: typeof auth.last4 === "string" ? auth.last4 : null } : null;
}

/** Paystack metadata comes back as an object or a JSON string. */
export function readMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** What the shopper paid that we asked for, in kobo (the fee passed on to them doesn't count). */
export { paidKobo as paidAmountKobo } from "@/lib/paystack";
