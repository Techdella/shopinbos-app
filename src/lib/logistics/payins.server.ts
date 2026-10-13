import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { naira } from "@shared/onboarding";
import { owedAfterCredit, readDedicatedAccount, readDedicatedCharge, type PayInApplication } from "./payin-rules";
import { applyRemittanceTx } from "./remittances";
import { refreshPayInStandingSafely } from "./payin-standing.server";
import { fetchRecentDedicatedCharges } from "./paystack-dva";

// Transfers into delivery partners' pay-in accounts (Paystack Dedicated Virtual Accounts, see paystack-dva.ts):
//   - charge.success with channel "dedicated_nuban" → find the partner by the receiving account number (or the
//     Paystack customer), then settle their unpaid cash jobs oldest first (remittances.ts applyRemittanceTx);
//   - dedicatedaccount.assign.success / .failed → store (or give up on) the partner's account number.
// Every transfer is saved once per Paystack reference (PartnerPayIn.reference is unique) in the same transaction
// as the settlement, so a replayed webhook never counts twice. A transfer we can't place waits as "unmatched"
// for the team to assign from the admin partner page.

export type PayInEventOutcome = "matched" | "unmatched" | "duplicate" | "ignored";

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function adminIds() {
  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true }, take: 20 }).catch(() => []);
  return admins.map((admin) => admin.id);
}

async function notifyAdmins(title: string, description: string, link: string, priority: "info" | "warning") {
  for (const userId of await adminIds()) {
    await createNotification({ userId, type: "logistics", priority, title, description, link, event: "admin.alert" }).catch(() => null);
  }
}

/** "We got your ₦X. Thanks." to the partner, and a line for the team. */
async function notifyMatched(partnerId: string, amount: number, application: PayInApplication, via: "auto" | "admin") {
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { userId: true, displayName: true } });
  if (!partner) return;
  const jobs = `${application.ids.length} ${application.ids.length === 1 ? "job" : "jobs"}`;
  const description =
    application.outcome === "exact"
      ? `That pays in the cash from ${jobs}. Nothing more to pay in right now.`
      : application.outcome === "over"
      ? `That pays in the cash from ${jobs}. You paid ${naira(application.creditAfter)} extra, so we'll use it for your next cash jobs.`
      : `That pays in the cash from ${jobs}. ${naira(application.stillDue)} is still to pay in.`;
  await createNotification({
    userId: partner.userId,
    type: "logistics",
    priority: "success",
    title: `We got your ${naira(amount)}. Thanks.`,
    description,
    link: "/logistics/cash",
    sendEmail: true,
    event: "payin.received",
  }).catch(() => null);
  await notifyAdmins(
    `${partner.displayName} paid in ${naira(amount)}`,
    `${via === "admin" ? "Assigned by the team" : "Matched automatically"}: ${jobs} settled${application.creditAfter > 0 ? `, ${naira(application.creditAfter)} kept as credit` : ""}${application.stillDue > 0 ? `, ${naira(application.stillDue)} still due` : ""}.`,
    `/admin/logistics-partners/${partnerId}`,
    "info",
  );
}

/** A Paystack charge.success paid into a pay-in account. Never throws for bad data; DB errors propagate (Paystack retries). */
export async function handleDedicatedAccountCharge(data: unknown): Promise<PayInEventOutcome> {
  const charge = readDedicatedCharge(data);
  if (!charge) return "ignored";
  if (await db.partnerPayIn.findUnique({ where: { reference: charge.reference }, select: { id: true } })) return "duplicate";

  const account = charge.accountNumber
    ? await db.partnerPayInAccount.findUnique({ where: { accountNumber: charge.accountNumber }, select: { logisticsPartnerId: true } })
    : null;
  const byCustomer = !account && charge.customerCode
    ? await db.partnerPayInAccount.findFirst({ where: { customerCode: charge.customerCode }, select: { logisticsPartnerId: true } })
    : null;
  const partnerId = charge.currency === "NGN" ? (account ?? byCustomer)?.logisticsPartnerId ?? null : null;
  const raw = JSON.parse(JSON.stringify(data ?? {})) as Prisma.InputJsonValue;

  let result: { partnerId: string; application: PayInApplication } | null = null;
  try {
    result = await db.$transaction(async (tx) => {
      const payIn = await tx.partnerPayIn.create({
        data: {
          reference: charge.reference,
          amount: charge.amount,
          currency: charge.currency,
          accountNumber: charge.accountNumber,
          customerCode: charge.customerCode,
          senderName: charge.senderName,
          senderBank: charge.senderBank,
          paidAt: charge.paidAt,
          status: "unmatched",
          raw,
        },
        select: { id: true },
      });
      if (!partnerId) return null;
      const { remittance, application } = await applyRemittanceTx(tx, {
        partnerId,
        amount: charge.amount,
        method: "account",
        reference: charge.reference,
        note: charge.senderName ? `From ${charge.senderName}${charge.senderBank ? `, ${charge.senderBank}` : ""}` : null,
        createdAt: charge.paidAt,
      });
      await tx.partnerPayIn.update({
        where: { id: payIn.id },
        data: { status: "matched", matchedBy: "auto", matchedAt: new Date(), logisticsPartnerId: partnerId, remittanceId: remittance.id },
      });
      return { partnerId, application };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }

  if (result) {
    await notifyMatched(result.partnerId, charge.amount, result.application, "auto");
    // Paid in: lift a late pause straight away (payin-standing.server.ts).
    await refreshPayInStandingSafely(result.partnerId);
    return "matched";
  }
  await notifyAdmins(
    `A pay-in of ${naira(charge.amount)} needs a partner`,
    `${charge.senderName ?? "Someone"} paid ${charge.currency === "NGN" ? naira(charge.amount) : `${charge.currency} ${charge.amount}`} into account ${charge.accountNumber ?? "(unknown)"}, and we couldn't tell which delivery partner it's from. Assign it from Admin → Delivery partners.`,
    "/admin/logistics-partners#payins",
    "warning",
  );
  return "unmatched";
}

/** dedicatedaccount.assign.success / dedicatedaccount.assign.failed. */
export async function handleDedicatedAccountAssign(event: string, data: unknown): Promise<"saved" | "ignored"> {
  const account = readDedicatedAccount(data);
  if (!account.customerCode) return "ignored";
  const row = await db.partnerPayInAccount.findFirst({ where: { customerCode: account.customerCode }, select: { id: true, status: true } });
  if (!row) return "ignored";
  if (event === "dedicatedaccount.assign.success" && account.accountNumber) {
    await db.partnerPayInAccount.update({
      where: { id: row.id },
      data: {
        status: "assigned",
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        bankName: account.bankName,
        bankSlug: account.bankSlug,
        providerAccountId: account.providerAccountId,
        lastError: null,
      },
    });
    return "saved";
  }
  if (event === "dedicatedaccount.assign.failed" && row.status !== "assigned") {
    await db.partnerPayInAccount.update({ where: { id: row.id }, data: { status: "failed", lastError: "Paystack could not assign the account (dedicatedaccount.assign.failed)." } });
    return "saved";
  }
  return "ignored";
}

export type AssignResult = { ok: true; application: PayInApplication } | { ok: false; error: string };

/** The team gives an unmatched transfer to a delivery partner. Once only: an assigned transfer can't move again. */
export async function assignPayInToPartner(input: { payInId: string; partnerId: string; adminUserId: string }): Promise<AssignResult> {
  const partner = await db.logisticsPartner.findUnique({ where: { id: input.partnerId }, select: { id: true } });
  if (!partner) return { ok: false, error: "Pick a delivery partner." };
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PartnerPayIn" WHERE "id" = ${input.payInId} FOR UPDATE`;
    const payIn = await tx.partnerPayIn.findUnique({ where: { id: input.payInId } });
    if (!payIn) return { ok: false as const, error: "That payment is gone. Refresh the page." };
    if (payIn.status !== "unmatched" || payIn.remittanceId) return { ok: false as const, error: "That payment is already matched to a partner." };
    if (payIn.currency !== "NGN") return { ok: false as const, error: "Only naira payments can be assigned." };
    const { remittance, application } = await applyRemittanceTx(tx, {
      partnerId: input.partnerId,
      amount: payIn.amount,
      method: "account",
      reference: payIn.reference,
      note: `Assigned by the Shopinbos team${payIn.senderName ? ` · from ${payIn.senderName}` : ""}`,
      createdAt: payIn.paidAt,
    });
    await tx.partnerPayIn.update({
      where: { id: payIn.id },
      data: { status: "matched", matchedBy: "admin", matchedByUserId: input.adminUserId, matchedAt: new Date(), logisticsPartnerId: input.partnerId, remittanceId: remittance.id },
    });
    return { ok: true as const, application, amount: payIn.amount };
  });
  if (!result.ok) return result;
  await notifyMatched(input.partnerId, result.amount, result.application, "admin");
  await refreshPayInStandingSafely(input.partnerId);
  return { ok: true, application: result.application };
}

export type RecheckResult =
  | { ok: true; checked: boolean; matched: number; owed: number; overdue: number; paused: boolean }
  | { ok: false; error: string };

/**
 * "I've paid. Check again": asks Paystack for the latest transfers into the partner's pay-in account (in case a
 * webhook was slow or missed), matches any we haven't seen (same path as the webhook, so nothing counts twice), then
 * refreshes the partner's late standing. At most once a minute per partner.
 */
export async function recheckPartnerPayIns(partnerId: string, now: Date = new Date()): Promise<RecheckResult> {
  const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  let checked = false;
  let matched = 0;
  const fresh = await db.partnerPayInEvent
    .createManyAndReturn({ data: [{ logisticsPartnerId: partnerId, kind: "recheck", dedupeKey: `recheck:${partnerId}:${minute.toISOString()}` }], skipDuplicates: true, select: { id: true } })
    .catch(() => []);
  if (fresh.length) {
    const account = await db.partnerPayInAccount.findUnique({ where: { logisticsPartnerId: partnerId }, select: { status: true, customerId: true, customerCode: true } });
    if (account?.status === "assigned" && (account.customerId || account.customerCode)) {
      const charges = await fetchRecentDedicatedCharges({ customerId: account.customerId, since: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) });
      checked = charges !== null;
      for (const charge of charges ?? []) {
        const outcome = await handleDedicatedAccountCharge(charge).catch((error) => {
          console.error(`[pay-in recheck] partner ${partnerId}: could not match a transfer`, error);
          return "ignored" as const;
        });
        if (outcome === "matched") matched += 1;
      }
    }
  }
  const refreshed = await refreshPayInStandingSafely(partnerId);
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { codPaused: true, payInOverdueAmount: true } });
  return { ok: true, checked, matched, owed: refreshed?.owed ?? 0, overdue: partner?.payInOverdueAmount ?? 0, paused: partner?.codPaused ?? false };
}

/** Cash still to pay in for a partner (unremitted cash jobs minus credit), and when the oldest was collected. */
export async function partnerCashOwed(partnerId: string) {
  const [partner, jobs] = await Promise.all([
    db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { payInCredit: true } }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partnerId, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } },
      orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
      select: { codCollected: true, codCollectedAt: true, createdAt: true },
    }),
  ]);
  const held = jobs.reduce((sum, job) => sum + (job.codCollected ?? 0), 0);
  const credit = partner?.payInCredit ?? 0;
  return { held, credit, owed: owedAfterCredit(held, credit), jobs: jobs.length, oldest: jobs[0] ? jobs[0].codCollectedAt ?? jobs[0].createdAt : null };
}
