import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { appBase } from "@/lib/email/compliance.server";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";
import { createNotification } from "@/lib/notifications/create";
import { readSplitPlan, type DebtToDeduct, type PaymentSplitPlan, type SplitDeduction, type SplitGateway } from "@/lib/wallet/rules";
import {
  CLAIM_REASONS,
  CLAIM_WITHIN_DAYS,
  MIN_DEBT_KOBO,
  PAY_WITHIN_DAYS,
  PLANNED_HOLD_MS,
  applyPayment,
  claimProblem,
  debtIsOwed,
  debtIsPending,
  debtReasonLabel,
  deductibleKobo,
  dueDate,
  isDebtReason,
  remainingKobo,
  type ClaimTarget,
  type DebtReason,
} from "./rules";

// Money owed between businesses, server side (rules.ts has the rules). Every way it gets paid keeps Shopinbos out
// of the money: the debtor pays in the app through Paystack, split to the creditor's own Shopinbos Wallet
// subaccount; the creditor confirms they were paid another way; or, once overdue, the checkout split of the
// debtor's later sales sends part of their share to the creditor's bank (src/lib/wallet/rules.ts takeDebts).

export type MoneyResult = { ok: true; message?: string } | { ok: false; error: string };

/** Paystack references for payments of money owed, so the webhook can tell them from store orders. */
export const DEBT_PAYMENT_PREFIX = "owepay-";

const OPEN_SUPPLIER_STATUSES = ["rejected", "expired", "cancelled"];

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// ─── Names and links ──────────────────────────────────────────────────────────

/** The name each business goes by on Shopinbos: the store, the supplier or the delivery company. */
async function businessNames(userIds: Array<string | null>) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, { name: string; role: string }>();
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true, store: { select: { name: true } }, supplier: { select: { displayName: true } }, logisticsPartner: { select: { displayName: true } } },
  });
  return new Map(users.map((user) => [user.id, { name: user.store?.name || user.supplier?.displayName || user.logisticsPartner?.displayName || user.name || "A business", role: String(user.role) }]));
}

function walletLink(role: string | undefined) {
  return role === "supplier" ? "/supplier/wallet" : role === "logistics_partner" ? "/logistics/wallet" : "/home/wallet";
}

async function notify(userId: string | null, title: string, description: string, priority: "info" | "warning" | "critical" = "info", dedupeKey?: string) {
  if (!userId) return;
  const role = (await businessNames([userId])).get(userId)?.role;
  await createNotification({ userId, type: "payout", priority, title, description, link: walletLink(role), event: "money_owed", dedupeKey }).catch(() => null);
}

// ─── Automatic: paid at checkout, never sent ──────────────────────────────────

/** A supplier's whole cost on a split order: what was settled to them plus anything taken from it for their debts. */
function supplierCostKobo(plan: PaymentSplitPlan, supplierId: string) {
  const share = plan.suppliers.find((row) => row.supplierId === supplierId);
  if (!share) return 0;
  return share.kobo + (plan.deductions ?? []).filter((row) => row.from === supplierId).reduce((sum, row) => sum + row.kobo, 0);
}

/**
 * Records what each supplier owes back for dropship orders the gateway paid them for at checkout that they then
 * declined, missed or cancelled: they hold the shop's money for goods they didn't send. Once per supplier order
 * (sourceKey), due in PAY_WITHIN_DAYS. One that ended longer ago than that (from before money owed was recorded,
 * so it may have been paid back already) starts as a claim the supplier accepts or answers, never as an automatic
 * deduction. Replacement orders (a switch to another supplier) weren't in the checkout split, so they owe nothing.
 * Safe to run any number of times. Never throws.
 */
export async function syncNotSentDebts(where: { sellerId?: string; supplierId?: string; since?: Date } = {}) {
  try {
    const rows = await db.supplierOrder.findMany({
      where: {
        status: { in: OPEN_SUPPLIER_STATUSES },
        replacesId: null,
        ...(where.sellerId ? { sellerId: where.sellerId } : {}),
        ...(where.supplierId ? { supplierId: where.supplierId } : {}),
        ...(where.since ? { updatedAt: { gte: where.since } } : {}),
        retailOrder: { paymentSplit: { not: Prisma.DbNull }, paystackStatus: "success" },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, supplierId: true, sellerId: true, retailOrderId: true, updatedAt: true, supplier: { select: { userId: true, displayName: true } }, retailOrder: { select: { orderNumber: true, paymentSplit: true } } },
    });
    if (!rows.length) return 0;
    const known = new Set((await db.businessDebt.findMany({ where: { sourceKey: { in: rows.map((row) => `notsent:${row.id}`) } }, select: { sourceKey: true } })).map((row) => row.sourceKey));
    let created = 0;
    for (const row of rows) {
      if (known.has(`notsent:${row.id}`)) continue;
      const plan = readSplitPlan(row.retailOrder.paymentSplit);
      const amountKobo = plan ? supplierCostKobo(plan, row.supplierId) : 0;
      if (amountKobo <= 0) continue;
      const now = new Date();
      const old = now.getTime() - row.updatedAt.getTime() > PAY_WITHIN_DAYS * 24 * 60 * 60 * 1000;
      try {
        await db.businessDebt.create({
          data: {
            sourceKey: `notsent:${row.id}`,
            debtorUserId: row.supplier.userId,
            creditorUserId: row.sellerId,
            reason: "not_sent",
            amountKobo,
            status: old ? "claimed" : "open",
            details: `Paid at checkout for order ${row.retailOrder.orderNumber}, which wasn't sent.${old ? " If you already paid it back outside the app, say so." : ""}`,
            retailOrderId: row.retailOrderId,
            supplierOrderId: row.id,
            dueAt: old ? null : dueDate(now),
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") continue; // another caller recorded it first
        throw error;
      }
      created += 1;
      const names = await businessNames([row.sellerId]);
      const shop = names.get(row.sellerId)?.name ?? "the shop";
      await notify(
        row.supplier.userId,
        `Pay back ${naira(amountKobo)} for order ${row.retailOrder.orderNumber}`,
        old
          ? `You were paid for this dropship order at checkout but didn't send it, so the money goes back to ${shop}. Accept it in your Shopinbos Wallet, or say if you already paid it back.`
          : `You were paid for this dropship order at checkout but didn't send it, so the money goes back to ${shop}. Pay it in your Shopinbos Wallet within 3 days; after that it comes out of your next orders.`,
        "warning",
      );
    }
    return created;
  } catch (error) {
    console.error("[money owed] could not record not-sent debts", error);
    return 0;
  }
}

// ─── Deductions from later sales ──────────────────────────────────────────────

/** What planned deductions (checkouts not yet paid) are holding of each debt. */
async function heldByCheckouts(debtIds: string[], now = new Date()) {
  if (!debtIds.length) return new Map<string, number>();
  const rows = await db.businessDebtPayment.groupBy({
    by: ["debtId"],
    where: { debtId: { in: debtIds }, method: "deduction", status: "planned", createdAt: { gt: new Date(now.getTime() - PLANNED_HOLD_MS) } },
    _sum: { amountKobo: true },
  });
  return new Map(rows.map((row) => [row.debtId, row._sum.amountKobo ?? 0]));
}

/**
 * Overdue debts the businesses in an order owe, as the split can take them: `debtors` maps each business's user to
 * its place in the split ("seller" or its supplier id). Only debts whose creditor can be paid on this gateway (or
 * Shopinbos itself) are taken, oldest due first. Never throws: a problem here must not stop a checkout.
 */
export async function debtsToDeduct(debtors: Map<string, string>, gateway: SplitGateway, now = new Date()): Promise<DebtToDeduct[]> {
  try {
    if (!debtors.size) return [];
    const debts = await db.businessDebt.findMany({
      where: { debtorUserId: { in: [...debtors.keys()] }, status: "open", dueAt: { lte: now } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 20,
      select: { id: true, debtorUserId: true, creditorUserId: true, amountKobo: true, paidKobo: true },
    });
    if (!debts.length) return [];
    const creditorIds = [...new Set(debts.map((debt) => debt.creditorUserId).filter((id): id is string => Boolean(id)))];
    const wallets = creditorIds.length
      ? await db.wallet.findMany({ where: { userId: { in: creditorIds }, status: "active", subaccountStatus: "active", subaccountCode: { not: null } }, select: { userId: true, subaccountCode: true, korapaySplitAccount: true } })
      : [];
    const accountOf = (userId: string) => {
      const wallet = wallets.find((row) => row.userId === userId);
      return (gateway === "korapay" ? wallet?.korapaySplitAccount : wallet?.subaccountCode) ?? null;
    };
    const held = await heldByCheckouts(debts.map((debt) => debt.id), now);
    return debts.flatMap((debt) => {
      const to = debt.creditorUserId ? accountOf(debt.creditorUserId) : null;
      if (debt.creditorUserId && !to) return [];
      const availableKobo = deductibleKobo(debt, held.get(debt.id) ?? 0);
      return availableKobo > 0 ? [{ debtId: debt.id, from: debtors.get(debt.debtorUserId)!, to, availableKobo }] : [];
    });
  } catch (error) {
    console.error("[money owed] could not look up debts for a checkout", error);
    return [];
  }
}

/**
 * Holds the parts of debts a payment's split takes, until it's paid (or PLANNED_HOLD_MS passes). `key` names the
 * payment: the store order's id, or delivery:<bookingId> for a delivery fee. Never throws.
 */
export async function holdPlannedDeductions(key: string, deductions: SplitDeduction[], retailOrderId: string | null = key) {
  if (!deductions.length) return;
  await db.businessDebtPayment
    .createMany({
      data: deductions.map((row) => ({ debtId: row.debtId, method: "deduction", amountKobo: row.kobo, reference: `deduct:${key}:${row.debtId}`, retailOrderId, status: "planned" })),
      skipDuplicates: true,
    })
    .catch((error) => console.error(`[money owed] could not hold deductions for ${key}`, error));
}

/** The deductions written into a payment's Paystack metadata (set by our server), or none. */
export function readDeductions(value: unknown): SplitDeduction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const item = row as Partial<SplitDeduction> | null;
    return item && typeof item.debtId === "string" && typeof item.from === "string" && (typeof item.to === "string" || item.to === null) && typeof item.kobo === "number" && item.kobo > 0
      ? [{ debtId: item.debtId, from: item.from, to: item.to, kobo: Math.round(item.kobo) }]
      : [];
  });
}

type Tx = Prisma.TransactionClient;

/**
 * Applies one payment to a debt inside a transaction (the debt row locked), once per reference. Anything paid on
 * top of what was owed becomes a debt the other way round, so nobody keeps money twice.
 */
async function applyToDebt(tx: Tx, input: { debtId: string; kobo: number; method: "paystack" | "deduction" | "confirmed"; reference: string; retailOrderId?: string | null }) {
  await tx.$queryRaw`SELECT "id" FROM "BusinessDebt" WHERE "id" = ${input.debtId} FOR UPDATE`;
  const existing = await tx.businessDebtPayment.findUnique({ where: { reference: input.reference }, select: { id: true, status: true } });
  if (existing?.status === "applied") return null;
  const debt = await tx.businessDebt.findUnique({ where: { id: input.debtId } });
  if (!debt) return null;
  const result = applyPayment(debt, input.kobo);
  const now = new Date();
  if (existing) await tx.businessDebtPayment.update({ where: { id: existing.id }, data: { status: "applied", amountKobo: input.kobo } });
  else await tx.businessDebtPayment.create({ data: { debtId: debt.id, method: input.method, amountKobo: input.kobo, reference: input.reference, retailOrderId: input.retailOrderId ?? null, status: "applied" } });
  // A waived or rejected debt paid anyway counts as paid too: the whole payment is then excess and goes back.
  const owed = debtIsOwed(debt.status);
  const credit = owed ? result.credit : 0;
  const excess = owed ? result.excess : input.kobo;
  if (credit > 0) {
    await tx.businessDebt.update({ where: { id: debt.id }, data: { paidKobo: { increment: credit }, ...(result.settled ? { status: "paid", paidAt: now } : {}) } });
  }
  if (excess > 0 && debt.creditorUserId) {
    await tx.businessDebt.create({
      data: {
        sourceKey: `overpaid:${input.reference}`,
        debtorUserId: debt.creditorUserId,
        creditorUserId: debt.debtorUserId,
        reason: "overpaid",
        amountKobo: excess,
        status: "open",
        details: `Paid ${naira(excess)} more than was owed (${debtReasonLabel(debt.reason).toLowerCase()}).`,
        retailOrderId: debt.retailOrderId,
        dueAt: dueDate(now),
      },
    });
  } else if (excess > 0) {
    console.warn(`[money owed] ${input.reference} paid Shopinbos ${excess} kobo more than debt ${debt.id} needed: refund it by hand`);
  }
  return { debt, credit, excess, settled: owed && result.settled };
}

/**
 * Once a payment is made (a store order, or a delivery fee: `key` as in holdPlannedDeductions), applies the debts its
 * split took from the businesses' shares and writes each repayment on the creditor's statement. Idempotent (one
 * payment per key and debt). Never throws.
 */
export async function applyDeductions(input: { key: string; deductions: SplitDeduction[]; label: string; paystackReference: string | null; retailOrderId: string | null }) {
  const { key, label, paystackReference, retailOrderId } = input;
  for (const deduction of input.deductions) {
    try {
      const applied = await db.$transaction((tx) => applyToDebt(tx, { debtId: deduction.debtId, kobo: deduction.kobo, method: "deduction", reference: `deduct:${key}:${deduction.debtId}`, retailOrderId }));
      if (!applied) continue;
      if (applied.debt.creditorUserId) {
        const wallet = await db.wallet.findUnique({ where: { userId: applied.debt.creditorUserId }, select: { id: true } });
        if (wallet) {
          await db.walletEntry
            .createMany({ data: [{ walletId: wallet.id, reference: `repaid:${key}:${deduction.debtId}`, kind: "repayment", amountKobo: deduction.kobo, description: `Paid back from ${label}`, orderId: retailOrderId, paystackReference: paystackReference ?? key }], skipDuplicates: true })
            .catch(() => null);
        }
      }
      const names = await businessNames([applied.debt.debtorUserId, applied.debt.creditorUserId]);
      const rest = remainingKobo({ amountKobo: applied.debt.amountKobo, paidKobo: applied.debt.paidKobo + applied.credit });
      await notify(applied.debt.debtorUserId, `${naira(deduction.kobo)} of ${label} went to what you owe`, `It went straight to ${applied.debt.creditorUserId ? names.get(applied.debt.creditorUserId)?.name ?? "the business you owe" : "Shopinbos"}. ${rest > 0 ? `${naira(rest)} is still owed: pay it in your Shopinbos Wallet to keep your full share of your next orders.` : "You've paid it all."}`);
      await notify(applied.debt.creditorUserId, `${names.get(applied.debt.debtorUserId)?.name ?? "A business"} paid you back ${naira(deduction.kobo)}`, rest > 0 ? `It came from their share of a sale and goes straight to your bank. ${naira(rest)} is still owed.` : "It came from their share of a sale and goes straight to your bank. That's everything they owed.");
    } catch (error) {
      console.error(`[money owed] could not apply deduction ${deduction.debtId} from ${key}`, error);
    }
  }
}

// ─── Paying in the app ────────────────────────────────────────────────────────

export type StartResult = { ok: true; accessCode: string; reference: string; authorizationUrl: string | null } | { ok: false; error: string };

/** Starts the Paystack payment of what's left of a debt, split straight to the creditor's bank. */
export async function startDebtPayment(user: { id: string; email: string | null }, debtId: string): Promise<StartResult> {
  if (!paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)) return { ok: false, error: "Card payments aren't set up yet. Pay them directly and ask them to confirm it in the app." };
  const debt = await db.businessDebt.findFirst({ where: { id: debtId, debtorUserId: user.id } });
  if (!debt) return { ok: false, error: "We couldn't find this." };
  if (!debtIsOwed(debt.status)) return { ok: false, error: debtIsPending(debt.status) ? "Accept the claim first, or tell them why it isn't right." : "There's nothing left to pay on this." };
  const amountKobo = deductibleKobo(debt, (await heldByCheckouts([debt.id])).get(debt.id) ?? 0);
  if (amountKobo < MIN_DEBT_KOBO) return { ok: false, error: amountKobo > 0 ? "What's left is too small to pay by card. Transfer it to them and ask them to confirm it." : "A sale is paying this off right now. Check again in a couple of hours." };
  let split: Record<string, unknown> | undefined;
  if (debt.creditorUserId) {
    const wallet = await db.wallet.findFirst({ where: { userId: debt.creditorUserId, status: "active", subaccountStatus: "active" }, select: { subaccountCode: true } });
    const name = (await businessNames([debt.creditorUserId])).get(debt.creditorUserId)?.name ?? "They";
    if (!wallet?.subaccountCode) return { ok: false, error: `${name} hasn't set up their Shopinbos Wallet yet. Transfer it to them directly and ask them to confirm it in the app.` };
    // The creditor's subaccount gets it all; Shopinbos's charge is zero and the creditor bears Paystack's fee.
    split = { subaccount: wallet.subaccountCode, transaction_charge: 0, bearer: "subaccount" };
  }
  const reference = `${DEBT_PAYMENT_PREFIX}${randomBytes(9).toString("hex")}`;
  const role = (await businessNames([user.id])).get(user.id)?.role;
  try {
    const started = await initializePaystackTransaction({
      email: user.email || "payments@shopinbos.com",
      amountKobo,
      reference,
      callbackUrl: `${appBase()}${walletLink(role)}`,
      metadata: { kind: "debt_payment", debtId: debt.id, debtorUserId: user.id },
      split,
    });
    if (!started.access_code) return { ok: false, error: "Paystack couldn't start this payment. Try again." };
    return { ok: true, accessCode: started.access_code, reference: started.reference ?? reference, authorizationUrl: started.authorization_url ?? null };
  } catch (error) {
    console.error(`[money owed] could not start a payment for debt ${debt.id}`, error);
    return { ok: false, error: "Paystack couldn't start this payment. Try again in a moment." };
  }
}

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

export type ConfirmResult = { ok: true; fresh: boolean } | { ok: false; error: string; retry?: boolean };

/**
 * Records a debt payment once Paystack (never the browser or the webhook body) says it succeeded. Safe from the
 * popup and the webhook at the same time: the debt row is locked and a reference is applied once.
 */
export async function confirmDebtPayment(reference: string, expectedUserId?: string): Promise<ConfirmResult> {
  if (!reference.startsWith(DEBT_PAYMENT_PREFIX)) return { ok: false, error: "Not a payment of money owed." };
  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (payment.status !== "success") return { ok: false, error: "The payment didn't go through." };
  const meta = readMetadata(payment.metadata);
  const debtId = typeof meta.debtId === "string" ? meta.debtId : "";
  if (meta.kind !== "debt_payment" || !debtId) return { ok: false, error: "This payment isn't for money owed." };
  if (expectedUserId && meta.debtorUserId !== expectedUserId) return { ok: false, error: "This payment belongs to someone else." };
  const kobo = Math.round(Number(payment.amount));
  if (!(kobo > 0)) return { ok: false, error: "The payment has no amount." };
  const applied = await db.$transaction((tx) => applyToDebt(tx, { debtId, kobo, method: "paystack", reference }));
  if (!applied) return { ok: true, fresh: false };
  const names = await businessNames([applied.debt.debtorUserId]);
  const rest = remainingKobo({ amountKobo: applied.debt.amountKobo, paidKobo: applied.debt.paidKobo + applied.credit });
  await notify(applied.debt.creditorUserId, `${names.get(applied.debt.debtorUserId)?.name ?? "A business"} paid you ${naira(kobo)}`, `For ${debtReasonLabel(applied.debt.reason).toLowerCase()}. It goes straight to your bank.${rest > 0 ? ` ${naira(rest)} is still owed.` : ""}`);
  return { ok: true, fresh: true };
}

/** The creditor got the money another way (a transfer or cash): what's left is marked paid. */
export async function creditorConfirmsPaid(user: { id: string }, debtId: string): Promise<MoneyResult> {
  const debt = await db.businessDebt.findFirst({ where: { id: debtId, creditorUserId: user.id } });
  if (!debt || !debtIsOwed(debt.status)) return { ok: false, error: "There's nothing waiting on this." };
  const kobo = remainingKobo(debt);
  if (kobo <= 0) return { ok: false, error: "This is already paid." };
  await db.$transaction((tx) => applyToDebt(tx, { debtId, kobo, method: "confirmed", reference: `confirm:${debtId}:${Date.now()}` }));
  const names = await businessNames([user.id]);
  await notify(debt.debtorUserId, `${names.get(user.id)?.name ?? "They"} confirmed you paid them`, `${naira(kobo)} for ${debtReasonLabel(debt.reason).toLowerCase()} is settled.`);
  return { ok: true, message: "Marked as paid." };
}

// ─── Claims ───────────────────────────────────────────────────────────────────

export interface ClaimInput {
  target: ClaimTarget;
  targetId: string;
  reason: string;
  amountKobo: number | null;
  details: string;
}

/** Who a claim is against and what the order was worth, after checking the claimant is the seller on it. */
async function claimSubject(sellerId: string, target: ClaimTarget, targetId: string) {
  if (target === "supplier_order") {
    const row = await db.supplierOrder.findFirst({ where: { id: targetId, sellerId }, select: { id: true, status: true, costTotal: true, shippedAt: true, deliveredAt: true, retailOrderId: true, supplier: { select: { userId: true } }, retailOrder: { select: { orderNumber: true } } } });
    if (!row) return null;
    if (!["shipped", "delivered"].includes(row.status)) return { error: "You can claim once the supplier has sent it." };
    return { debtorUserId: row.supplier.userId, maxKobo: Math.round(row.costTotal * 100), deliveredAt: row.deliveredAt, label: `order ${row.retailOrder.orderNumber}`, links: { supplierOrderId: row.id, retailOrderId: row.retailOrderId } };
  }
  if (target === "wholesale_order") {
    const row = await db.wholesaleOrder.findFirst({ where: { id: targetId, sellerId }, select: { id: true, status: true, totalPrice: true, deliveredAt: true, supplier: { select: { userId: true } } } });
    if (!row) return null;
    if (!["shipped", "delivered"].includes(String(row.status))) return { error: "You can claim once the supplier has sent it." };
    return { debtorUserId: row.supplier.userId, maxKobo: Math.round(row.totalPrice * 100), deliveredAt: row.deliveredAt, label: `wholesale order ${row.id.slice(-6).toUpperCase()}`, links: { wholesaleOrderId: row.id } };
  }
  const row = await db.deliveryBooking.findFirst({ where: { id: targetId, sellerId }, select: { id: true, status: true, pickedUpAt: true, deliveredAt: true, codAmount: true, orderId: true, trackingCode: true, logisticsPartner: { select: { userId: true } } } });
  if (!row) return null;
  if (!row.pickedUpAt && !["picked_up", "in_transit", "delivered", "failed"].includes(String(row.status))) return { error: "The partner is responsible once their rider picks it up." };
  const order = row.orderId ? await db.retailOrder.findUnique({ where: { id: row.orderId }, select: { total: true, shippingFee: true, orderNumber: true } }) : null;
  // A parcel is worth its goods: the order less delivery, else what the rider was to collect.
  const value = order ? Number(order.total) - Number(order.shippingFee ?? 0) : row.codAmount ?? 0;
  return { debtorUserId: row.logisticsPartner.userId, maxKobo: Math.round(Math.max(0, value) * 100), deliveredAt: row.deliveredAt, label: order ? `the delivery of order ${order.orderNumber}` : `delivery ${row.trackingCode ?? row.id.slice(-6).toUpperCase()}`, links: { bookingId: row.id, retailOrderId: row.orderId } };
}

/** A seller claims money back from a supplier (wrong or damaged goods) or a delivery partner (lost after pickup). */
export async function raiseClaim(user: { id: string }, input: ClaimInput): Promise<MoneyResult> {
  if (!CLAIM_REASONS[input.target]) return { ok: false, error: "Choose the order this is about." };
  const subject = await claimSubject(user.id, input.target, input.targetId);
  if (!subject) return { ok: false, error: "We couldn't find this order on your account." };
  if ("error" in subject) return { ok: false, error: subject.error! };
  const details = input.details.trim().slice(0, 1500);
  const problem = claimProblem({ target: input.target, reason: input.reason, amountKobo: input.amountKobo, maxKobo: subject.maxKobo, details, deliveredAt: subject.deliveredAt });
  if (problem) return { ok: false, error: problem };
  try {
    await db.businessDebt.create({
      data: {
        sourceKey: `claim:${input.target}:${input.targetId}`,
        debtorUserId: subject.debtorUserId,
        creditorUserId: user.id,
        reason: input.reason as DebtReason,
        amountKobo: input.amountKobo!,
        status: "claimed",
        details,
        createdByUserId: user.id,
        ...subject.links,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: "You've already raised a claim for this order. Our team can change it if something's wrong." };
    throw error;
  }
  const names = await businessNames([user.id]);
  await notify(subject.debtorUserId, `${names.get(user.id)?.name ?? "A shop"} claims ${naira(input.amountKobo!)} for ${subject.label}`, `"${debtReasonLabel(input.reason)}". Accept it, or tell them and our team why it isn't right, in your Shopinbos Wallet.`, "warning");
  return { ok: true, message: "Claim sent. They can accept it or tell our team why it isn't right; we'll let you know." };
}

/** The business a claim is against accepts it (it's owed from now, due in 3 days) or disputes it (the team decides). */
export async function respondToClaim(user: { id: string }, debtId: string, accept: boolean, response: string): Promise<MoneyResult> {
  const debt = await db.businessDebt.findFirst({ where: { id: debtId, debtorUserId: user.id, status: "claimed" } });
  if (!debt) return { ok: false, error: "This claim isn't waiting for you." };
  const text = response.trim().slice(0, 1500);
  if (!accept && text.length < 10) return { ok: false, error: "Say why it isn't right, so our team can decide." };
  const now = new Date();
  const moved = await db.businessDebt.updateMany({ where: { id: debt.id, status: "claimed" }, data: accept ? { status: "open", dueAt: dueDate(now), response: text || null } : { status: "disputed", response: text } });
  if (!moved.count) return { ok: false, error: "This claim has already moved on. Refresh to see where it is." };
  const names = await businessNames([user.id]);
  const who = names.get(user.id)?.name ?? "They";
  await notify(debt.creditorUserId, accept ? `${who} accepted your claim` : `${who} disputed your claim`, accept ? `They'll pay ${naira(debt.amountKobo)} within 3 days; after that it comes out of their next sales.` : "Our team will look at both sides and decide, usually within 2 working days.");
  return { ok: true, message: accept ? "Accepted. Pay it within 3 days; after that it comes out of your next sales." : "Sent to our team. We'll look at both sides and let you both know." };
}

/** The business owed lets it go: a claim is withdrawn, or what's left of a debt is forgiven. */
export async function creditorCancels(user: { id: string }, debtId: string): Promise<MoneyResult> {
  const debt = await db.businessDebt.findFirst({ where: { id: debtId, creditorUserId: user.id, status: { in: ["claimed", "disputed", "open"] } } });
  if (!debt) return { ok: false, error: "There's nothing to cancel on this." };
  await db.businessDebt.update({ where: { id: debt.id }, data: { status: debtIsPending(debt.status) ? "rejected" : "waived", decisionNote: "Cancelled by the business owed." } });
  const names = await businessNames([user.id]);
  await notify(debt.debtorUserId, `${names.get(user.id)?.name ?? "They"} cancelled what you owed`, `${debtReasonLabel(debt.reason)}: nothing more to pay.`);
  return { ok: true, message: "Cancelled." };
}

// ─── The team ─────────────────────────────────────────────────────────────────

/** The team decides a claim: upheld (owed from now, for the amount they settle on) or rejected. */
export async function decideClaim(admin: { id: string }, debtId: string, input: { uphold: boolean; amountKobo?: number | null; note: string }): Promise<MoneyResult> {
  const debt = await db.businessDebt.findUnique({ where: { id: debtId } });
  if (!debt || !debtIsPending(debt.status)) return { ok: false, error: "This claim isn't waiting for a decision." };
  const note = input.note.trim().slice(0, 1500);
  if (note.length < 5) return { ok: false, error: "Write the reason for the decision: both businesses see it." };
  const amountKobo = input.amountKobo ?? debt.amountKobo;
  if (input.uphold && (amountKobo < MIN_DEBT_KOBO || amountKobo > debt.amountKobo)) return { ok: false, error: "The amount must be between ₦100 and what was claimed." };
  const now = new Date();
  await db.businessDebt.update({
    where: { id: debt.id },
    data: input.uphold
      ? { status: "open", amountKobo, dueAt: dueDate(now), decisionNote: note, decidedByUserId: admin.id, decidedAt: now }
      : { status: "rejected", decisionNote: note, decidedByUserId: admin.id, decidedAt: now },
  });
  const title = input.uphold ? `Claim upheld: ${naira(amountKobo)} is owed` : "Claim rejected";
  await notify(debt.debtorUserId, title, input.uphold ? `Our team decided: "${note}". Pay it within 3 days; after that it comes out of your next sales.` : `Our team decided: "${note}". Nothing to pay.`, input.uphold ? "warning" : "info");
  await notify(debt.creditorUserId, title, `Our team decided: "${note}".`);
  return { ok: true };
}

/** The team cancels what's left of a debt (for example the businesses settled it between them). */
export async function waiveDebt(admin: { id: string }, debtId: string, note: string): Promise<MoneyResult> {
  const text = note.trim().slice(0, 1500);
  if (text.length < 5) return { ok: false, error: "Write why: both businesses see it." };
  const moved = await db.businessDebt.updateMany({ where: { id: debtId, status: { in: ["open", "claimed", "disputed"] } }, data: { status: "waived", decisionNote: text, decidedByUserId: admin.id, decidedAt: new Date() } });
  return moved.count ? { ok: true } : { ok: false, error: "This is already closed." };
}

/**
 * The team records money a business owes another (or Shopinbos, for a chargeback Paystack took from Shopinbos's
 * balance), found by account email. Owed straight away, due in 3 days.
 */
export async function recordDebt(admin: { id: string }, input: { debtorEmail: string; creditorEmail: string | null; reason: string; amountKobo: number | null; details: string }): Promise<MoneyResult> {
  if (!isDebtReason(input.reason) || input.reason === "overpaid") return { ok: false, error: "Choose a reason." };
  if (input.amountKobo === null || input.amountKobo < MIN_DEBT_KOBO) return { ok: false, error: "Enter an amount of at least ₦100." };
  const details = input.details.trim().slice(0, 1500);
  if (details.length < 10) return { ok: false, error: "Say what it's for: both businesses see it." };
  const find = (email: string) => db.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } }, select: { id: true } });
  const debtor = await find(input.debtorEmail);
  if (!debtor) return { ok: false, error: "No account has the email of the business that owes." };
  const creditor = input.creditorEmail?.trim() ? await find(input.creditorEmail) : null;
  if (input.creditorEmail?.trim() && !creditor) return { ok: false, error: "No account has the email of the business owed." };
  if (creditor?.id === debtor.id) return { ok: false, error: "A business can't owe itself." };
  const now = new Date();
  const id = randomBytes(9).toString("hex");
  await db.businessDebt.create({
    data: { sourceKey: `admin:${id}`, debtorUserId: debtor.id, creditorUserId: creditor?.id ?? null, reason: input.reason, amountKobo: input.amountKobo, status: "open", details, dueAt: dueDate(now), createdByUserId: admin.id, decidedByUserId: admin.id, decidedAt: now },
  });
  const names = await businessNames([creditor?.id ?? null]);
  await notify(debtor.id, `You owe ${creditor ? names.get(creditor.id)?.name ?? "a business" : "Shopinbos"} ${naira(input.amountKobo)}`, `${debtReasonLabel(input.reason)}: ${details} Pay it in your Shopinbos Wallet within 3 days; after that it comes out of your next sales.`, "warning");
  if (creditor) await notify(creditor.id, `${naira(input.amountKobo)} is owed to you`, `Our team recorded it: ${details}`);
  return { ok: true };
}

// ─── Reminders ────────────────────────────────────────────────────────────────

/**
 * The cron: records not-sent debts from the last 30 days (in case a status change missed it) and reminds each
 * debtor once a day while a debt is due within a day or overdue. Idempotent.
 */
export async function runMoneyOwedSweep(now = new Date()) {
  const recorded = await syncNotSentDebts({ since: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) });
  const dayAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const due = await db.businessDebt.findMany({
    where: { status: "open", dueAt: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) }, OR: [{ remindedAt: null }, { remindedAt: { lt: dayAgo } }] },
    take: 200,
    select: { id: true, debtorUserId: true, creditorUserId: true, amountKobo: true, paidKobo: true, dueAt: true, reason: true },
  });
  const names = await businessNames(due.map((debt) => debt.creditorUserId));
  let reminded = 0;
  for (const debt of due) {
    const left = remainingKobo(debt);
    if (left <= 0) continue;
    const overdue = debt.dueAt!.getTime() <= now.getTime();
    const who = debt.creditorUserId ? names.get(debt.creditorUserId)?.name ?? "a business" : "Shopinbos";
    await notify(
      debt.debtorUserId,
      overdue ? `Overdue: you owe ${who} ${naira(left)}` : `Due tomorrow: ${naira(left)} to ${who}`,
      overdue ? "Until it's paid, part of your share of each sale goes to it. Pay it in your Shopinbos Wallet to get your full share back." : `For ${debtReasonLabel(debt.reason).toLowerCase()}. Pay it in your Shopinbos Wallet; after the due date it comes out of your next sales.`,
      overdue ? "critical" : "warning",
      `money-owed:${debt.id}:${now.toISOString().slice(0, 10)}`,
    );
    await db.businessDebt.update({ where: { id: debt.id }, data: { remindedAt: now } });
    reminded += 1;
  }
  return { recorded, reminded };
}

// ─── What the wallet page shows ───────────────────────────────────────────────

export interface DebtView {
  id: string;
  otherParty: string;
  reason: string;
  reasonLabel: string;
  status: string;
  amountKobo: number;
  remainingKobo: number;
  details: string | null;
  response: string | null;
  decisionNote: string | null;
  dueAt: string | null;
  overdue: boolean;
  createdAt: string;
  orderId: string | null;
  /** The creditor can be paid by card in the app. */
  payable: boolean;
}

export interface ClaimableOrder {
  target: ClaimTarget;
  id: string;
  label: string;
  party: string;
  maxKobo: number;
}

export interface MoneyOwedView {
  iOwe: DebtView[];
  owedToMe: DebtView[];
  /** Sellers: recent orders they can raise a claim on. */
  claimable: ClaimableOrder[];
}

const SHOWN_STATUSES = ["claimed", "disputed", "open"];

export async function loadMoneyOwed(user: { id: string; role: string }, now = new Date()): Promise<MoneyOwedView> {
  if (user.role === "seller") await syncNotSentDebts({ sellerId: user.id });
  if (user.role === "supplier") {
    const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (supplier) await syncNotSentDebts({ supplierId: supplier.id });
  }
  const recent = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const debts = await db.businessDebt.findMany({
    where: { OR: [{ debtorUserId: user.id }, { creditorUserId: user.id }], AND: [{ OR: [{ status: { in: SHOWN_STATUSES } }, { updatedAt: { gte: recent } }] }] },
    orderBy: [{ createdAt: "desc" }],
    take: 60,
  });
  const names = await businessNames(debts.flatMap((debt) => [debt.debtorUserId, debt.creditorUserId]));
  const creditorWallets = new Set(
    (await db.wallet.findMany({ where: { userId: { in: debts.flatMap((debt) => (debt.debtorUserId === user.id && debt.creditorUserId ? [debt.creditorUserId] : [])) }, status: "active", subaccountStatus: "active", subaccountCode: { not: null } }, select: { userId: true } })).map((row) => row.userId),
  );
  const view = (debt: (typeof debts)[number], mine: boolean): DebtView => {
    const other = mine ? debt.creditorUserId : debt.debtorUserId;
    return {
      id: debt.id,
      otherParty: other ? names.get(other)?.name ?? "A business" : "Shopinbos",
      reason: debt.reason,
      reasonLabel: debtReasonLabel(debt.reason),
      status: debt.status,
      amountKobo: debt.amountKobo,
      remainingKobo: remainingKobo(debt),
      details: debt.details,
      response: debt.response,
      decisionNote: debt.decisionNote,
      dueAt: debt.dueAt?.toISOString() ?? null,
      overdue: debtIsOwed(debt.status) && remainingKobo(debt) > 0 && Boolean(debt.dueAt && debt.dueAt.getTime() <= now.getTime()),
      createdAt: debt.createdAt.toISOString(),
      orderId: debt.retailOrderId,
      payable: mine && (debt.creditorUserId === null || creditorWallets.has(debt.creditorUserId)),
    };
  };
  return {
    iOwe: debts.filter((debt) => debt.debtorUserId === user.id).map((debt) => view(debt, true)),
    owedToMe: debts.filter((debt) => debt.creditorUserId === user.id).map((debt) => view(debt, false)),
    claimable: user.role === "seller" ? await claimableOrders(user.id, now) : [],
  };
}

/** A seller's recent supplier orders, wholesale orders and deliveries a claim can still be raised on. */
async function claimableOrders(sellerId: string, now: Date): Promise<ClaimableOrder[]> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [supplierOrders, wholesale, bookings, claimed] = await Promise.all([
    db.supplierOrder.findMany({ where: { sellerId, status: { in: ["shipped", "delivered"] }, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, costTotal: true, deliveredAt: true, supplier: { select: { displayName: true } }, retailOrder: { select: { orderNumber: true } } } }),
    db.wholesaleOrder.findMany({ where: { sellerId, status: { in: ["shipped", "delivered"] }, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, totalPrice: true, quantity: true, deliveredAt: true, supplier: { select: { displayName: true } }, supplierProduct: { select: { name: true } } } }),
    db.deliveryBooking.findMany({ where: { sellerId, status: { in: ["picked_up", "in_transit", "delivered", "failed"] }, updatedAt: { gte: since } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, orderId: true, codAmount: true, trackingCode: true, deliveredAt: true, logisticsPartner: { select: { displayName: true } } } }),
    db.businessDebt.findMany({ where: { creditorUserId: sellerId, sourceKey: { startsWith: "claim:" }, createdAt: { gte: new Date(since.getTime() - 30 * 24 * 60 * 60 * 1000) } }, select: { sourceKey: true } }),
  ]);
  const taken = new Set(claimed.map((row) => row.sourceKey));
  const orders = bookings.some((row) => row.orderId)
    ? await db.retailOrder.findMany({ where: { id: { in: bookings.flatMap((row) => (row.orderId ? [row.orderId] : [])) } }, select: { id: true, orderNumber: true, total: true, shippingFee: true } })
    : [];
  // Claims close CLAIM_WITHIN_DAYS after delivery (not delivered yet, or a failed delivery: still open).
  const inTime = (deliveredAt: Date | null) => !deliveredAt || now.getTime() - deliveredAt.getTime() <= CLAIM_WITHIN_DAYS * 24 * 60 * 60 * 1000;
  const out: ClaimableOrder[] = [];
  for (const row of supplierOrders.filter((item) => inTime(item.deliveredAt))) out.push({ target: "supplier_order", id: row.id, label: `Order ${row.retailOrder.orderNumber} (dropship)`, party: row.supplier.displayName, maxKobo: Math.round(row.costTotal * 100) });
  for (const row of wholesale.filter((item) => inTime(item.deliveredAt))) out.push({ target: "wholesale_order", id: row.id, label: `Wholesale: ${row.quantity} × ${row.supplierProduct.name}`, party: row.supplier.displayName, maxKobo: Math.round(row.totalPrice * 100) });
  for (const row of bookings.filter((item) => inTime(item.deliveredAt))) {
    const order = orders.find((item) => item.id === row.orderId);
    const value = order ? Number(order.total) - Number(order.shippingFee ?? 0) : row.codAmount ?? 0;
    out.push({ target: "booking", id: row.id, label: order ? `Delivery of order ${order.orderNumber}` : `Delivery ${row.trackingCode ?? row.id.slice(-6).toUpperCase()}`, party: row.logisticsPartner.displayName, maxKobo: Math.round(Math.max(0, value) * 100) });
  }
  return out.filter((row) => !taken.has(`claim:${row.target}:${row.id}`) && row.maxKobo >= MIN_DEBT_KOBO);
}

