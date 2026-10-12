import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { applyPayIn, type PayInApplication } from "./payin-rules";

// Cash pay-ins: a partner pays Shopinbos the cash their riders collected. Every way in (the manual form, the
// partner API, and transfers to the partner's own pay-in account, matched in payins.server.ts) goes through
// applyRemittanceTx: the pay-in plus any credit settles the oldest unremitted cash jobs it fully covers
// (payin-rules applyPayIn), and what's left is kept as the partner's credit for next time.

export type RemittanceMethod = "transfer" | "cash" | "api" | "account";

type Tx = Prisma.TransactionClient;

const REMITTANCE_SELECT = { id: true, amount: true, method: true, reference: true, note: true, covered: true, creditAfter: true, outcome: true, createdAt: true } as const;

export type SavedRemittance = Prisma.CodRemittanceGetPayload<{ select: typeof REMITTANCE_SELECT }>;

export type RemittanceResult =
  | { ok: true; remittance: SavedRemittance; jobIds: string[]; covered: number; unallocated: number; application: PayInApplication }
  | { ok: false; error: string };

/**
 * Saves one pay-in inside a transaction and settles jobs with it. Locks the partner row first, so two pay-ins
 * arriving together (a webhook and the form, or two webhooks) are applied one after the other and the credit is
 * never counted twice.
 */
export async function applyRemittanceTx(
  tx: Tx,
  input: { partnerId: string; amount: number; method: RemittanceMethod; reference: string | null; note: string | null; createdAt?: Date },
) {
  await tx.$queryRaw`SELECT "id" FROM "LogisticsPartner" WHERE "id" = ${input.partnerId} FOR UPDATE`;
  const partner = await tx.logisticsPartner.findUnique({ where: { id: input.partnerId }, select: { payInCredit: true } });
  const unremitted = await tx.deliveryBooking.findMany({
    where: { logisticsPartnerId: input.partnerId, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } },
    orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
    select: { id: true, codCollected: true },
  });
  const application = applyPayIn(unremitted, input.amount, partner?.payInCredit ?? 0);

  const remittance = await tx.codRemittance.create({
    data: {
      logisticsPartnerId: input.partnerId,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      note: input.note,
      covered: application.covered,
      creditAfter: application.creditAfter,
      outcome: application.outcome,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
    select: REMITTANCE_SELECT,
  });
  if (application.ids.length) {
    // remittanceId: null in the filter so a pay-in recorded at the same moment can't claim the same jobs twice.
    await tx.deliveryBooking.updateMany({ where: { id: { in: application.ids }, remittanceId: null }, data: { remittanceId: remittance.id } });
  }
  await tx.logisticsPartner.update({ where: { id: input.partnerId }, data: { payInCredit: application.creditAfter } });
  return { remittance, application };
}

export async function recordRemittance(input: { partnerId: string; amount: number; method: RemittanceMethod; reference?: string | null; note?: string | null }): Promise<RemittanceResult> {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount you paid in." };
  const reference = input.reference?.trim().slice(0, 120) || null;
  const note = input.note?.trim().slice(0, 500) || null;

  return db.$transaction(async (tx) => {
    if (reference) {
      const duplicate = await tx.codRemittance.findFirst({ where: { logisticsPartnerId: input.partnerId, reference }, select: { id: true } });
      if (duplicate) return { ok: false as const, error: "You've already saved a pay-in with that transfer reference. Check it, or leave it empty." };
    }
    const { remittance, application } = await applyRemittanceTx(tx, { partnerId: input.partnerId, amount, method: input.method, reference, note });
    return { ok: true as const, remittance, jobIds: application.ids, covered: application.covered, unallocated: application.creditAfter, application };
  });
}
