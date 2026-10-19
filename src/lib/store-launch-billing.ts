import "server-only";
import { billingEmail } from "@/lib/auth/billing-email";

import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { verifyPaystackTransaction } from "@/lib/paystack";
import { publishStoreDraft } from "@/lib/store-publishing";
import { mergeBrandSettings } from "@/lib/workspace";
import { getPriceBook } from "@/lib/pricing/price-book.server";

export type StoreLaunchPaymentOption = "full" | "installment" | "balance";

/** The launch fee and deposit in naira, from Admin › Pricing (the deposit is never more than the fee). */
export async function storeLaunchPrices() {
  const book = await getPriceBook();
  return { totalNgn: book["launch.price"], depositNgn: book["launch.deposit"] };
}

export function installmentDueAt(from = new Date()) {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0, 22, 59, 59));
}

export async function ensureStoreLaunchPaymentsTable() {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS store_launch_payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      payment_option TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      amount_due INTEGER NOT NULL,
      amount_paid INTEGER NOT NULL DEFAULT 0,
      balance_due INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'NGN',
      status TEXT NOT NULL DEFAULT 'initialized',
      due_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      provider_response JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS store_launch_payments_store_id_idx ON store_launch_payments(store_id)");
}

export interface StoreLaunchPaymentRow {
  id: string;
  user_id: string;
  store_id: string;
  reference: string;
  payment_option: StoreLaunchPaymentOption;
  total_amount: number;
  amount_due: number;
  amount_paid: number;
  balance_due: number;
  currency: string;
  status: string;
  due_at: Date | null;
}

export async function findStoreLaunchPayment(reference: string) {
  await ensureStoreLaunchPaymentsTable();
  const rows = await db.$queryRawUnsafe<StoreLaunchPaymentRow[]>(
    "SELECT * FROM store_launch_payments WHERE reference = $1 LIMIT 1",
    reference,
  );
  return rows[0] ?? null;
}

export async function completeStoreLaunchPayment(reference: string) {
  const payment = await findStoreLaunchPayment(reference);
  if (!payment) throw new Error("Payment record was not found.");

  // Webhooks and callbacks can arrive in either order. A previous attempt may have
  // recorded the successful charge before publishing failed, so make publication
  // retryable instead of leaving a paid store offline forever.
  if (payment.status === "paid" || payment.status === "settled") {
    if (payment.payment_option !== "balance") {
      const store = await db.store.findUnique({
        where: { id: payment.store_id },
        select: { status: true },
      });
      if (store && store.status !== "active" && store.status !== "published") {
        await publishStoreDraft({ storeId: payment.store_id });
      }
    }
    return { payment, paidNgn: payment.amount_paid, balanceDue: payment.balance_due };
  }

  const verified = await verifyPaystackTransaction(reference);
  const paidNgn = Math.floor(verified.amount / 100);
  if (verified.status !== "success" || verified.currency !== "NGN" || paidNgn !== payment.amount_due) {
    throw new Error("Paystack did not confirm the expected payment amount.");
  }
  const expectedPurpose = payment.payment_option === "balance" ? "store_launch_balance" : "store_launch";
  if (verified.reference !== reference
    || verified.metadata?.purpose !== expectedPurpose
    || verified.metadata?.store_id !== payment.store_id
    || verified.metadata?.user_id !== payment.user_id) {
    throw new Error("Paystack returned payment details that do not match this store launch.");
  }
  const user = await db.user.findUnique({ where: { id: payment.user_id }, select: { id: true, email: true } });
  if (!user || verified.customer?.email?.toLowerCase() !== billingEmail(user)) {
    throw new Error("The Paystack customer does not match this Shopinbos account.");
  }

  const isBalancePayment = payment.payment_option === "balance";
  const balanceDue = isBalancePayment ? 0 : Math.max(0, payment.total_amount - paidNgn);
  await db.$executeRawUnsafe(
    `UPDATE store_launch_payments SET status = 'paid', amount_paid = $2, balance_due = $3,
     paid_at = COALESCE(paid_at, NOW()), updated_at = NOW(), provider_response = $4::jsonb WHERE reference = $1`,
    reference,
    paidNgn,
    balanceDue,
    JSON.stringify(verified),
  );
  const store = await db.store.findUnique({ where: { id: payment.store_id }, select: { brandSettings: true } });
  if (store) {
    const currentSettings = store.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings)
      ? store.brandSettings as Record<string, unknown>
      : {};
    const currentBilling = currentSettings.launchBilling && typeof currentSettings.launchBilling === "object" && !Array.isArray(currentSettings.launchBilling)
      ? currentSettings.launchBilling as Record<string, unknown>
      : {};
    const aggregatePaid = isBalancePayment ? payment.total_amount : paidNgn;
    await db.store.update({
      where: { id: payment.store_id },
      data: {
        brandSettings: mergeBrandSettings(store.brandSettings, {
          launchBilling: {
            status: payment.payment_option === "installment" ? "deposit_paid" : "paid",
            option: payment.payment_option,
            reference,
            totalAmount: payment.total_amount,
            amountPaid: aggregatePaid,
            balanceDue,
            dueAt: isBalancePayment ? null : payment.due_at?.toISOString() ?? null,
            depositReference: isBalancePayment ? currentBilling.reference ?? null : null,
          },
        }) as Prisma.InputJsonValue,
      },
    });
  }
  if (isBalancePayment) {
    await db.$executeRawUnsafe(
      "UPDATE store_launch_payments SET status = 'settled', balance_due = 0, updated_at = NOW() WHERE store_id = $1 AND payment_option = 'installment' AND status = 'paid'",
      payment.store_id,
    );
  }
  if (!isBalancePayment) {
    await publishStoreDraft({ storeId: payment.store_id });
  }
  return { payment, paidNgn, balanceDue };
}
