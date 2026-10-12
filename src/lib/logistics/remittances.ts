import "server-only";
import { db } from "@/lib/db/client";
import { jobsCoveredBy } from "./job-rules";

// Cash pay-ins: a partner pays Shopinbos the cash their riders collected. Settles jobs with the same rule as the
// portal's recordCodRemittance (job-rules jobsCoveredBy: oldest unremitted cash jobs first, each job whole).

export type RemittanceMethod = "transfer" | "cash" | "api";

export type RemittanceResult =
  | { ok: true; remittance: { id: string; amount: number; method: string; reference: string | null; note: string | null; createdAt: Date }; jobIds: string[]; covered: number; unallocated: number }
  | { ok: false; error: string };

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

    const unremitted = await tx.deliveryBooking.findMany({
      where: { logisticsPartnerId: input.partnerId, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } },
      orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, codCollected: true },
    });
    const allocation = jobsCoveredBy(unremitted, amount);
    const unallocated = Math.max(0, Math.round((amount - allocation.covered) * 100) / 100);

    const remittance = await tx.codRemittance.create({
      data: { logisticsPartnerId: input.partnerId, amount, method: input.method, reference, note },
      select: { id: true, amount: true, method: true, reference: true, note: true, createdAt: true },
    });
    if (allocation.ids.length) {
      // remittanceId: null in the filter so a pay-in recorded at the same moment can't claim the same jobs twice.
      await tx.deliveryBooking.updateMany({ where: { id: { in: allocation.ids }, remittanceId: null }, data: { remittanceId: remittance.id } });
    }
    return { ok: true as const, remittance, jobIds: allocation.ids, covered: allocation.covered, unallocated };
  });
}
