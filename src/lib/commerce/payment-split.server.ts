import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { DEFAULT_FEE, planSplit, readStoredSplit, refundDebt, toKobo, type FeeConfig, type StoredSplit } from "./payment-split";
import type { StockHold } from "./stock-holds";

// The database side of the Paystack split (rules in payment-split.ts; setup in docs/paystack-split.md):
//   * the seller's Paystack subaccount, made from their payout bank (payout-bank.ts calls ensureSellerSubaccount)
//   * planning the split for a new order, and the initialize parameters that carry it
//   * the seller's balance with Shopinbos (SellerBalanceEntry): refunded split orders add what they owe, paid orders
//     that took some back subtract it.
//
// PAYSTACK_SPLITS=on switches it on. Off, or without a subaccount, an order is paid to Shopinbos's balance as before.

const PAYSTACK_DEFAULT_BASE = "https://api.paystack.co";

/** PAYSTACK_BASE_URL points Paystack calls at a local stub in tests; production leaves it unset. */
export function paystackBase() {
  const base = process.env.PAYSTACK_BASE_URL?.trim();
  return base ? base.replace(/\/+$/, "") : PAYSTACK_DEFAULT_BASE;
}

function paystackSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  return key && !key.includes("your_") && !key.includes("your-") ? key : null;
}

export function splitsEnabled() {
  return process.env.PAYSTACK_SPLITS?.trim().toLowerCase() === "on" && Boolean(paystackSecret());
}

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

// ─── Subaccounts ────────────────────────────────────────────────────────────

/** The account number from what Paystack sent back when the payout bank was saved (we only keep it masked). */
function savedAccountNumber(payoutBank: Record<string, unknown>) {
  const details = record(record(record(payoutBank.providerResponse).data).details);
  const value = typeof details.account_number === "string" ? details.account_number.replace(/\D/g, "") : "";
  return value.length === 10 ? value : null;
}

/**
 * Makes (or points at a new bank) the seller's Paystack subaccount and saves its code on the payout bank.
 * Returns the code, or null if Paystack isn't set up or said no (the order is then paid to Shopinbos as before).
 */
export async function ensureSellerSubaccount(
  storeId: string,
  bank?: { bankCode: string; accountNumber: string },
): Promise<string | null> {
  const secret = paystackSecret();
  if (!secret) return null;
  const store = await db.store.findUnique({ where: { id: storeId }, select: { name: true, brandSettings: true, user: { select: { email: true } } } });
  if (!store) return null;
  const settings = record(store.brandSettings);
  const payoutBank = record(settings.payoutBank);
  const existing = typeof payoutBank.paystackSubaccountCode === "string" ? payoutBank.paystackSubaccountCode : null;
  if (existing && !bank) return existing;

  const { PAYSTACK_BANK_CODES } = await import("@/lib/payout-bank");
  const bankCode = bank?.bankCode ?? (typeof payoutBank.bankName === "string" ? PAYSTACK_BANK_CODES[payoutBank.bankName] : undefined);
  const accountNumber = bank?.accountNumber ?? savedAccountNumber(payoutBank);
  if (!bankCode || !accountNumber) return existing;

  const body = {
    business_name: store.name.slice(0, 100),
    bank_code: bankCode,
    account_number: accountNumber,
    // Every split order sets its own transaction_charge, which overrides this.
    percentage_charge: DEFAULT_FEE.rate,
    description: `Shopinbos store ${storeId}`,
    ...(store.user?.email ? { primary_contact_email: store.user.email } : {}),
  };
  try {
    const response = await fetch(`${paystackBase()}/subaccount${existing ? `/${encodeURIComponent(existing)}` : ""}`, {
      method: existing ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = record(await response.json().catch(() => null));
    const code = typeof record(json.data).subaccount_code === "string" ? (record(json.data).subaccount_code as string) : existing;
    if (!response.ok || !json.status || !code) {
      console.warn(`[paystack split] subaccount for store ${storeId} not saved: ${typeof json.message === "string" ? json.message : response.status}`);
      await saveSubaccount(storeId, existing, "failed");
      return existing;
    }
    await saveSubaccount(storeId, code, "active");
    return code;
  } catch (error) {
    console.warn(`[paystack split] subaccount for store ${storeId} failed`, error);
    return existing;
  }
}

async function saveSubaccount(storeId: string, code: string | null, status: "active" | "failed") {
  // Re-read so a payout bank saved meanwhile isn't overwritten.
  const store = await db.store.findUnique({ where: { id: storeId }, select: { brandSettings: true } });
  if (!store) return;
  const settings = record(store.brandSettings);
  const payoutBank = { ...record(settings.payoutBank), paystackSubaccountCode: code, paystackSubaccountStatus: status };
  await db.store.update({ where: { id: storeId }, data: { brandSettings: { ...settings, payoutBank } as Prisma.InputJsonValue } });
}

// ─── Planning an order ──────────────────────────────────────────────────────

async function feeConfig(): Promise<FeeConfig> {
  const row = await db.platformFeeConfig.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" }, select: { rate: true, minFee: true, maxFee: true } });
  return row ? { rate: row.rate, minFee: row.minFee, maxFee: row.maxFee } : DEFAULT_FEE;
}

/** Dropship suppliers' cost for these lines, the same way supplier orders are priced (wholesale price × quantity). */
async function supplierCost(holds: readonly StockHold[]) {
  const lines = holds.filter((hold): hold is Extract<StockHold, { source: "supplier" }> => hold.source === "supplier" && Boolean(hold.supplierProductId));
  if (!lines.length) return { cost: 0, dropship: false };
  const products = await db.supplierProduct.findMany({ where: { id: { in: lines.map((line) => line.supplierProductId) } }, select: { id: true, wholesalePrice: true } });
  const price = new Map(products.map((product) => [product.id, Number(product.wholesalePrice)]));
  return { cost: lines.reduce((sum, line) => sum + (price.get(line.supplierProductId) ?? 0) * line.quantity, 0), dropship: true };
}

/** What the seller owes Shopinbos now (positive) or is owed (negative). */
export async function sellerBalance(storeId: string) {
  const sum = await db.sellerBalanceEntry.aggregate({ where: { storeId }, _sum: { amount: true } });
  return Math.round((sum._sum.amount ?? 0) * 100) / 100;
}

/** The split for a new Paystack order, kept on the order (RetailOrder.paymentSplit). */
export async function planOrderSplit(input: {
  storeId: string;
  total: number;
  shippingFee: number;
  stockHolds: readonly StockHold[];
  affiliateCommission: number | null;
}): Promise<StoredSplit> {
  if (!splitsEnabled()) return { mode: "held", reason: "disabled" };
  try {
    const subaccount = await ensureSellerSubaccount(input.storeId);
    if (!subaccount) return { mode: "held", reason: "no_subaccount" };
    const [fee, supplier, balance] = await Promise.all([feeConfig(), supplierCost(input.stockHolds), sellerBalance(input.storeId)]);
    const plan = planSplit({
      total: input.total,
      shippingFee: input.shippingFee,
      supplierCost: supplier.cost,
      partnerDelivery: supplier.dropship,
      affiliateCommission: input.affiliateCommission ?? 0,
      balance,
      fee,
    });
    return plan ? { mode: "split", subaccount, ...plan } : { mode: "held", reason: "nothing_to_seller" };
  } catch (error) {
    console.warn(`[paystack split] planning for store ${input.storeId} failed; paying to Shopinbos`, error);
    return { mode: "held", reason: "error" };
  }
}

/** Extra /transaction/initialize fields for a split order (Shopinbos keeps platformShare; the seller bears Paystack's fee). */
export function splitInitializeParams(split: StoredSplit | null) {
  if (!split || split.mode !== "split") return {};
  return { subaccount: split.subaccount, transaction_charge: toKobo(split.platformShare), bearer: "subaccount" };
}

// ─── The seller's balance ───────────────────────────────────────────────────

/** A split order was paid: record what it took back from (or paid back to) the seller's balance. Idempotent. */
export async function confirmOrderSplit(orderId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { storeId: true, paymentSplit: true, paystackStatus: true } });
  const split = readStoredSplit(order?.paymentSplit);
  if (!order || split?.mode !== "split" || !split.balanceApplied || order.paystackStatus !== "success") return;
  await db.sellerBalanceEntry
    .create({ data: { storeId: order.storeId, orderId, kind: "recovered", amount: -split.balanceApplied } })
    .catch((error: { code?: string }) => {
      if (error?.code !== "P2002") throw error; // already recorded
    });
}

/**
 * A split order was refunded: the seller's share had gone to their bank, so they owe it back. What the order took
 * back from their balance went back to the buyer too, so that's undone as well: they owe sellerShare +
 * balanceApplied (refundDebt in payment-split.ts). Idempotent.
 */
export async function recordRefundedSplit(orderId: string) {
  const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { storeId: true, paymentSplit: true } });
  const split = readStoredSplit(order?.paymentSplit);
  if (!order || split?.mode !== "split") return;
  const amount = refundDebt(split);
  if (!(amount > 0)) return;
  await db.sellerBalanceEntry
    .create({ data: { storeId: order.storeId, orderId, kind: "refund", amount } })
    .catch((error: { code?: string }) => {
      if (error?.code !== "P2002") throw error;
    });
}
