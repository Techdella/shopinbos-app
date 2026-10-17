import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { appBase } from "@/lib/email/compliance.server";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { paystackSecretReady } from "@shared/checkout-payments";
import { createNotification } from "@/lib/notifications/create";
import { refreshPayInStandingSafely, UNPAID_CASH_WHERE } from "./payin-standing.server";

// Cash on delivery belongs to the seller, so a delivery partner pays it to each seller directly; it never passes
// through Shopinbos. Two ways, both settling the partner's cash jobs for that seller (the late-cash rules in
// payin-standing.server.ts keep working: they count cash jobs with no remittance):
//   * By card or transfer through Paystack, split to the seller's Shopinbos Wallet (src/lib/wallet): the payment
//     settles straight to the seller's bank. The transaction is started here, with the jobs it pays for in its
//     metadata, and only Paystack's verified reply settles them (the popup and the webhook both call confirm).
//   * The seller confirms they received the cash (handed over, or sent to their bank) on their Wallet page.

/** Paystack references for these pay-ins, so the webhook can tell them from store orders. */
export const SELLER_PAYIN_PREFIX = "codpay-";

export interface SellerCashOwed {
  sellerId: string;
  sellerName: string;
  amount: number;
  jobIds: string[];
  oldestAt: Date;
  /** The seller's wallet settles to their bank, so the partner can pay them in the app. */
  payable: boolean;
}

const sellerName = (seller: { name: string; store: { name: string } | null }) => seller.store?.name || seller.name;

/** Cash the partner's riders collected and haven't passed on yet, per seller, oldest first. */
export async function cashOwedBySeller(partnerId: string): Promise<SellerCashOwed[]> {
  const jobs = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partnerId, ...UNPAID_CASH_WHERE },
    orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: { id: true, sellerId: true, codCollected: true, codCollectedAt: true, createdAt: true, seller: { select: { name: true, store: { select: { name: true } } } } },
  });
  const wallets = await db.wallet.findMany({
    where: { userId: { in: [...new Set(jobs.map((job) => job.sellerId))] }, status: "active", subaccountStatus: "active", subaccountCode: { not: null } },
    select: { userId: true },
  });
  const payable = new Set(wallets.map((wallet) => wallet.userId));
  const bySeller = new Map<string, SellerCashOwed>();
  for (const job of jobs) {
    const row = bySeller.get(job.sellerId) ?? { sellerId: job.sellerId, sellerName: sellerName(job.seller), amount: 0, jobIds: [], oldestAt: job.codCollectedAt ?? job.createdAt, payable: payable.has(job.sellerId) };
    row.amount = Math.round((row.amount + (job.codCollected ?? 0)) * 100) / 100;
    row.jobIds.push(job.id);
    bySeller.set(job.sellerId, row);
  }
  return [...bySeller.values()];
}

export type StartResult = { ok: true; accessCode: string; reference: string } | { ok: false; error: string };

/** Starts the Paystack payment of this seller's cash, split straight to the seller's bank. */
export async function startSellerPayIn(partner: { id: string; email: string | null }, sellerId: string): Promise<StartResult> {
  if (!paystackSecretReady(process.env.PAYSTACK_SECRET_KEY)) return { ok: false, error: "Card payments aren't set up yet. Hand the cash to the seller for now." };
  const owed = (await cashOwedBySeller(partner.id)).find((row) => row.sellerId === sellerId);
  if (!owed || owed.amount <= 0) return { ok: false, error: "There's no cash to pass on to this seller." };
  const wallet = await db.wallet.findFirst({ where: { userId: sellerId, status: "active", subaccountStatus: "active" }, select: { subaccountCode: true } });
  if (!wallet?.subaccountCode) return { ok: false, error: "This seller hasn't set up their Shopinbos Wallet. Hand them the cash, and they'll confirm it in the app." };
  const reference = `${SELLER_PAYIN_PREFIX}${randomBytes(9).toString("hex")}`;
  try {
    const started = await initializePaystackTransaction({
      email: partner.email || "payins@shopinbos.com",
      amountKobo: Math.round(owed.amount * 100),
      reference,
      callbackUrl: `${appBase()}/logistics/cash`,
      metadata: { kind: "cod_payin", partnerId: partner.id, sellerId, jobIds: owed.jobIds },
      // The seller's subaccount gets it all; Shopinbos's charge is zero and the seller bears Paystack's fee.
      split: { subaccount: wallet.subaccountCode, transaction_charge: 0, bearer: "subaccount" },
    });
    if (!started.access_code) return { ok: false, error: "Paystack couldn't start this payment. Try again." };
    return { ok: true, accessCode: started.access_code, reference: started.reference ?? reference };
  } catch (error) {
    console.error(`[seller payins] could not start a pay-in for partner ${partner.id}`, error);
    return { ok: false, error: "Paystack couldn't start this payment. Try again in a moment." };
  }
}

export type ConfirmResult = { ok: true; settled: number } | { ok: false; error: string; retry?: boolean };

function readMetadata(value: unknown): { kind?: unknown; partnerId?: unknown; sellerId?: unknown; jobIds?: unknown } {
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
 * Settles the cash jobs a seller pay-in paid for, once: asks Paystack (never the browser or the webhook body),
 * checks it succeeded, was for this partner and seller, and covered the jobs, then records the remittance. Safe
 * from the popup and the webhook at the same time (the partner row is locked; a reference is recorded once).
 */
export async function confirmSellerPayIn(reference: string, expectedPartnerId?: string): Promise<ConfirmResult> {
  if (!reference.startsWith(SELLER_PAYIN_PREFIX)) return { ok: false, error: "Not a seller pay-in." };
  let payment;
  try {
    payment = await verifyPaystackTransaction(reference);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Paystack could not check this payment.", retry: true };
  }
  if (payment.status !== "success") return { ok: false, error: "The payment didn't go through." };
  const meta = readMetadata(payment.metadata);
  const partnerId = typeof meta.partnerId === "string" ? meta.partnerId : "";
  const sellerId = typeof meta.sellerId === "string" ? meta.sellerId : "";
  const jobIds = Array.isArray(meta.jobIds) ? meta.jobIds.filter((id): id is string => typeof id === "string") : [];
  if (meta.kind !== "cod_payin" || !partnerId || !sellerId || !jobIds.length) return { ok: false, error: "This payment isn't a seller pay-in." };
  if (expectedPartnerId && expectedPartnerId !== partnerId) return { ok: false, error: "This payment belongs to another partner." };
  const paid = Math.round(Number(payment.amount)) / 100;

  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "LogisticsPartner" WHERE "id" = ${partnerId} FOR UPDATE`;
    const already = await tx.codRemittance.findFirst({ where: { logisticsPartnerId: partnerId, reference }, select: { id: true } });
    if (already) return { settled: 0, fresh: false };
    const jobs = await tx.deliveryBooking.findMany({ where: { id: { in: jobIds }, logisticsPartnerId: partnerId, sellerId, ...UNPAID_CASH_WHERE }, select: { id: true, codCollected: true } });
    const covered = Math.round(jobs.reduce((sum, job) => sum + (job.codCollected ?? 0), 0) * 100) / 100;
    // The payment was for exactly these jobs; less than they add up to (they can't change after delivery) is refused.
    if (paid + 0.005 < covered) throw new Error(`paid ${paid} is less than the ${covered} owed`);
    const partner = await tx.logisticsPartner.findUnique({ where: { id: partnerId }, select: { payInCredit: true } });
    const remittance = await tx.codRemittance.create({
      data: {
        logisticsPartnerId: partnerId,
        amount: paid,
        method: "seller",
        reference,
        note: "Paid to the seller through Paystack",
        covered,
        creditAfter: partner?.payInCredit ?? 0,
        outcome: paid > covered + 0.005 ? "over" : "exact",
      },
      select: { id: true },
    });
    if (jobs.length) await tx.deliveryBooking.updateMany({ where: { id: { in: jobs.map((job) => job.id) }, remittanceId: null }, data: { remittanceId: remittance.id } });
    return { settled: jobs.length, fresh: true };
  });
  if (outcome.fresh) {
    await refreshPayInStandingSafely(partnerId);
    await createNotification({ userId: sellerId, type: "order", priority: "info", title: "Cash on delivery paid to you", description: `A delivery partner paid you ₦${paid.toLocaleString("en-NG")} for cash their riders collected. It goes straight to your bank.`, link: "/home/wallet", event: "order.cod_paid" }).catch(() => null);
  }
  return { ok: true, settled: outcome.settled };
}

/** Partners whose riders collected cash for this seller that hasn't been passed on, for the seller's Wallet page. */
export async function cashOwedToSeller(sellerId: string) {
  const jobs = await db.deliveryBooking.findMany({
    where: { sellerId, ...UNPAID_CASH_WHERE },
    orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: { id: true, codCollected: true, logisticsPartnerId: true, logisticsPartner: { select: { displayName: true } } },
  });
  const byPartner = new Map<string, { partnerId: string; partnerName: string; amount: number; jobs: number }>();
  for (const job of jobs) {
    if (!job.logisticsPartnerId) continue;
    const row = byPartner.get(job.logisticsPartnerId) ?? { partnerId: job.logisticsPartnerId, partnerName: job.logisticsPartner?.displayName ?? "Delivery partner", amount: 0, jobs: 0 };
    row.amount = Math.round((row.amount + (job.codCollected ?? 0)) * 100) / 100;
    row.jobs += 1;
    byPartner.set(job.logisticsPartnerId, row);
  }
  return [...byPartner.values()];
}

/** The seller got the cash outside the app (handed over, or a transfer to their bank): settles those jobs. */
export async function sellerConfirmsCash(sellerId: string, partnerId: string): Promise<ConfirmResult> {
  const settled = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "LogisticsPartner" WHERE "id" = ${partnerId} FOR UPDATE`;
    const jobs = await tx.deliveryBooking.findMany({ where: { sellerId, logisticsPartnerId: partnerId, ...UNPAID_CASH_WHERE }, select: { id: true, codCollected: true } });
    if (!jobs.length) return 0;
    const covered = Math.round(jobs.reduce((sum, job) => sum + (job.codCollected ?? 0), 0) * 100) / 100;
    const partner = await tx.logisticsPartner.findUnique({ where: { id: partnerId }, select: { payInCredit: true } });
    const remittance = await tx.codRemittance.create({
      data: { logisticsPartnerId: partnerId, amount: covered, method: "seller_confirmed", note: "The seller confirmed they received the cash", covered, creditAfter: partner?.payInCredit ?? 0, outcome: "exact" },
      select: { id: true },
    });
    await tx.deliveryBooking.updateMany({ where: { id: { in: jobs.map((job) => job.id) }, remittanceId: null }, data: { remittanceId: remittance.id } });
    return jobs.length;
  });
  if (settled) await refreshPayInStandingSafely(partnerId);
  return settled ? { ok: true, settled } : { ok: false, error: "Nothing is waiting from this partner." };
}
