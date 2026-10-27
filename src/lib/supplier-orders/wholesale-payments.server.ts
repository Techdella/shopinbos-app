import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { appBase } from "@/lib/email/compliance.server";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";
import { paystackOutcome } from "@shared/paystack-return";
import { createNotification } from "@/lib/notifications/create";
import { buildSplitPlan, paystackSplitParams } from "@/lib/wallet/rules";
import { wholesalePayStep, type WholesalePayFacts, type WholesalePayStep } from "@shared/preorder";
import { applyDeductions, debtsToDeduct, holdPlannedDeductions, readDeductions } from "@/lib/money-owed/money-owed.server";

// A seller pays for a wholesale order by card in Shopinbos, once the supplier has accepted it. Paystack splits it
// all to the supplier's Shopinbos Wallet subaccount (src/lib/wallet), so it settles straight to the supplier's bank;
// Shopinbos takes nothing and never holds it (as for delivery fees, src/lib/logistics/delivery-fee-payments.server.ts).
// Only Paystack's verified reply marks the order paid (the return page, the app and the webhook all call confirm;
// the order is updated once). Overdue money the supplier owes is split to whoever it's owed to first.

/** Paystack references for wholesale payments, so the webhook can tell them from store orders. */
export const WHOLESALE_PAY_PREFIX = "whpay-";

// Preorders with a deposit (shared/preorder.ts wholesalePayStep) are paid in two parts on the same path: the deposit
// as soon as the preorder is placed, the balance once the supplier says the stock is ready. Each part has its own
// reference (depositRef, then paymentRef) and only Paystack's verified reply records it.

/** It can be paid by card now: what's due (the deposit, the balance, or the whole order once accepted). */
export function wholesalePayable(order: WholesalePayFacts) {
  return wholesalePayStep(order) !== null;
}

/** Of these orders, the ones the seller can pay by card now: payable and the supplier's wallet takes cards. */
export async function payableWholesaleOrders(orders: Array<WholesalePayFacts & { id: string; supplier: { userId: string } }>): Promise<Set<string>> {
  const open = orders.filter(wholesalePayable);
  if (!open.length) return new Set();
  const wallets = await db.wallet.findMany({
    where: { userId: { in: [...new Set(open.map((order) => order.supplier.userId))] }, status: "active", subaccountStatus: "active", subaccountCode: { not: null } },
    select: { userId: true },
  });
  const ready = new Set(wallets.map((wallet) => wallet.userId));
  return new Set(open.filter((order) => ready.has(order.supplier.userId)).map((order) => order.id));
}

/** The order columns wholesalePayStep reads. */
export const PAY_FACTS = { status: true, paidAt: true, paidOutAt: true, currency: true, totalPrice: true, preorder: true, depositKobo: true, depositPaidAt: true, preorderReadyAt: true } as const;

/** What each part is called in messages. */
const PART_WORDS: Record<WholesalePayStep, string> = { deposit: "the preorder deposit", balance: "the rest of the preorder", full: "the order" };

/** callbackUrl: where Paystack sends the payer back (the phone app passes shared/paystack-return appPaidCallbackUrl). */
export type StartOptions = { callbackUrl?: string };

export type StartResult = { ok: true; accessCode: string; reference: string; authorizationUrl: string | null } | { ok: false; error: string };

/** Starts the card payment of this wholesale order, split straight to the supplier's bank. */
export async function startWholesalePayment(seller: { id: string; email: string | null }, orderId: string, options: StartOptions = {}): Promise<StartResult> {
  if (!paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)) return { ok: false, error: "Card payments aren't set up yet. Pay the supplier directly for now." };
  const order = await db.wholesaleOrder.findFirst({
    where: { id: orderId, sellerId: seller.id },
    select: { id: true, ...PAY_FACTS, quantity: true, supplierId: true, supplier: { select: { userId: true, displayName: true } }, supplierProduct: { select: { name: true } } },
  });
  if (!order) return { ok: false, error: "We couldn't find this wholesale order." };
  if (order.paidAt || order.paidOutAt) return { ok: false, error: "This order is already paid." };
  const due = wholesalePayStep(order);
  if (!due && order.preorder && order.depositPaidAt && !order.preorderReadyAt) return { ok: false, error: "Your deposit is paid. Pay the rest once the supplier says the stock is ready." };
  if (!due && order.status === "pending") return { ok: false, error: "Wait for the supplier to accept your order, then pay." };
  if (!due) return { ok: false, error: "This order can't be paid by card." };
  const wallet = await db.wallet.findFirst({ where: { userId: order.supplier.userId, status: "active", subaccountStatus: "active" }, select: { subaccountCode: true } });
  if (!wallet?.subaccountCode) return { ok: false, error: `${order.supplier.displayName} can't take card payments yet, so pay them directly.` };
  const reference = `${WHOLESALE_PAY_PREFIX}${randomBytes(9).toString("hex")}`;
  const amountKobo = due.kobo;
  const debts = await debtsToDeduct(new Map([[order.supplier.userId, "seller"]]), "paystack");
  const plan = buildSplitPlan({ totalKobo: amountKobo, sellerSubaccount: wallet.subaccountCode, suppliers: [], debts });
  const deductions = plan.deductions ?? [];
  const key = due.step === "full" ? `wholesale:${order.id}` : `wholesale:${order.id}:${due.step}`;
  await holdPlannedDeductions(key, deductions, null);
  try {
    const started = await initializePaystackTransaction({
      email: seller.email || "wholesale@shopinbos.com",
      amountKobo,
      reference,
      // The web page confirms the reference Paystack adds; the phone app confirms when its browser closes.
      callbackUrl: options.callbackUrl ?? `${appBase()}${due.step === "full" ? "/marketplace/wholesale" : "/home/preorders?view=suppliers"}`,
      metadata: { kind: "wholesale", part: due.step, orderId: order.id, sellerId: seller.id, supplierId: order.supplierId, ...(deductions.length ? { deductions } : {}) },
      split: paystackSplitParams(plan),
    });
    if (!started.access_code) return { ok: false, error: "Paystack couldn't start this payment. Try again." };
    return { ok: true, accessCode: started.access_code, reference: started.reference ?? reference, authorizationUrl: started.authorization_url ?? null };
  } catch (error) {
    console.error(`[wholesale payments] could not start a payment for order ${order.id}`, error);
    return { ok: false, error: "Paystack couldn't start this payment. Try again in a moment." };
  }
}

export type ConfirmResult = { ok: true; fresh: boolean; orderId: string } | { ok: false; error: string; retry?: boolean; pending?: boolean };

function readMetadata(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Marks a wholesale order paid, once: asks Paystack (never the browser or the webhook body), checks it succeeded,
 * was for this order (and seller, when a seller is asking) and covered the total, then records it on the order and
 * the supplier's wallet statement. Safe from the return page, the app and the webhook at the same time.
 */
export async function confirmWholesalePayment(reference: string, expectedSellerId?: string): Promise<ConfirmResult> {
  if (!reference.startsWith(WHOLESALE_PAY_PREFIX)) return { ok: false, error: "Not a wholesale payment." };
  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  // Still on its way (a transfer or USSD) is "pending"; the webhook finishes it.
  if (payment.status !== "success") return { ok: false, error: "The payment didn't go through.", pending: paystackOutcome(payment.status) === "pending" };
  if (payment.currency && payment.currency !== "NGN") return { ok: false, error: "This payment wasn't in naira." };
  const meta = readMetadata(payment.metadata);
  const orderId = typeof meta.orderId === "string" ? meta.orderId : "";
  if (meta.kind !== "wholesale" || !orderId) return { ok: false, error: "This payment isn't for a wholesale order." };
  if (expectedSellerId && meta.sellerId !== expectedSellerId) return { ok: false, error: "This payment belongs to another seller." };

  const part: WholesalePayStep = meta.part === "deposit" || meta.part === "balance" ? meta.part : "full";

  const order = await db.wholesaleOrder.findUnique({
    where: { id: orderId },
    select: { id: true, sellerId: true, totalPrice: true, quantity: true, paymentRef: true, depositRef: true, depositKobo: true, depositPaidAt: true, supplierId: true, supplier: { select: { userId: true } }, supplierProduct: { select: { name: true } } },
  });
  if (!order) return { ok: false, error: "We couldn't find this wholesale order." };
  if (order.paymentRef === reference || order.depositRef === reference) return { ok: true, fresh: false, orderId: order.id };
  const paidKobo = Math.round(Number(payment.amount));
  const totalKobo = Math.round(order.totalPrice * 100);
  const expectedKobo = part === "deposit" ? order.depositKobo : part === "balance" ? totalKobo - order.depositKobo : totalKobo;
  if (expectedKobo <= 0 || paidKobo + 0.5 < expectedKobo) {
    console.warn(`[wholesale payments] ${reference} paid ${paidKobo} kobo, less than ${PART_WORDS[part]} of order ${order.id}`);
    return { ok: false, error: "The amount paid is less than what was due." };
  }

  const now = new Date();
  // Recorded once: the deposit while none is recorded; the balance (or the whole order) while it isn't paid.
  const moved =
    part === "deposit"
      ? await db.wholesaleOrder.updateMany({ where: { id: order.id, depositPaidAt: null, paidAt: null }, data: { depositPaidAt: now, depositRef: reference } })
      : await db.wholesaleOrder.updateMany({ where: { id: order.id, paidAt: null }, data: { paidAt: now, paymentRef: reference, paidOutAt: now } });
  if (moved.count !== 1) {
    const current = await db.wholesaleOrder.findUnique({ where: { id: order.id }, select: { paymentRef: true, depositRef: true } });
    if (current?.paymentRef === reference || current?.depositRef === reference) return { ok: true, fresh: false, orderId: order.id };
    console.warn(`[wholesale payments] order ${order.id} was paid twice (${part}): ${current?.depositRef ?? ""} ${current?.paymentRef ?? ""} and ${reference}`);
    return { ok: false, error: "This was already paid. Ask the supplier to send the second payment back." };
  }

  const what = `${order.quantity} × ${order.supplierProduct.name}`;
  const key = part === "full" ? `wholesale:${order.id}` : `wholesale:${order.id}:${part}`;
  const deductions = readDeductions(meta.deductions);
  const deductedKobo = deductions.reduce((sum, row) => sum + row.kobo, 0);
  if (deductions.length) await applyDeductions({ key, deductions, label: `the wholesale order for ${what}`, paystackReference: reference, retailOrderId: null });
  const wallet = await db.wallet.findUnique({ where: { userId: order.supplier.userId }, select: { id: true } });
  if (wallet) {
    const label = part === "deposit" ? `Preorder deposit · ${what}` : part === "balance" ? `Preorder balance · ${what}` : `Wholesale · ${what}`;
    await db.walletEntry
      .createMany({ data: [{ walletId: wallet.id, reference: key, kind: "supplier_order", amountKobo: paidKobo - deductedKobo, description: label, supplierId: order.supplierId, paystackReference: reference }], skipDuplicates: true })
      .catch((error) => console.error(`[wholesale payments] could not record order ${order.id} on the supplier's wallet`, error));
  }
  const amount = `₦${((paidKobo - deductedKobo) / 100).toLocaleString("en-NG")}${deductedKobo ? " after what you owe" : ""}`;
  await createNotification({
    userId: order.supplier.userId,
    type: "order",
    priority: "info",
    title: part === "deposit" ? "Preorder deposit paid" : part === "balance" ? "Preorder paid in full: pack it" : "Wholesale order paid",
    description:
      part === "deposit"
        ? `A shop paid the deposit for ${what}: ${amount}. It goes straight to your bank. They pay the rest when you say the stock is ready.`
        : part === "balance"
          ? `${what} is now paid in full (the rest: ${amount}, straight to your bank). Pack it and send it.`
          : `${what} was paid by card: ${amount}. It goes straight to your bank.`,
    link: part === "full" ? "/supplier/orders" : "/supplier/preorders",
    event: "payin.received",
  }).catch(() => null);
  return { ok: true, fresh: true, orderId: order.id };
}
