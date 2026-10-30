"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { PayoutsNotReady, addReward, closeWeek, markLinesPaid, voidLines, type LedgerResult } from "@/lib/payouts/ledger.server";
import { cleanPayday } from "@shared/payout-ledger";

// Admin › Payouts (the payout and rewards ledger, shared/payout-ledger.ts): mark lines paid, cancel them, add an
// airtime reward or adjustment, and close a Friday's list. Money section only (owners, admins, finance). Every
// change is written to the admin data access log by the ledger service.

const PATHS = ["/admin/payouts", "/resell"];

function refresh() {
  for (const path of PATHS) revalidatePath(path);
}

function failed(error: unknown): LedgerResult {
  if (error instanceof PayoutsNotReady) return { ok: false, error: error.message };
  console.error("[admin payouts]", error);
  return { ok: false, error: "That didn't work. Try again." };
}

const ids = (value: unknown) => (Array.isArray(value) ? value : [value]).map((id) => String(id ?? "").slice(0, 40)).filter(Boolean).slice(0, 500);

export async function markPayoutLinesPaidAction(input: { lineIds: string[]; method: string; reference?: string; note?: string }): Promise<LedgerResult> {
  const admin = await requireAdminSection("money");
  try {
    const result = await markLinesPaid({ adminId: admin.id, lineIds: ids(input?.lineIds), method: String(input?.method ?? ""), reference: input?.reference ?? null, note: input?.note ?? null });
    refresh();
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function voidPayoutLinesAction(input: { lineIds: string[]; note: string }): Promise<LedgerResult> {
  const admin = await requireAdminSection("money");
  try {
    const result = await voidLines({ adminId: admin.id, lineIds: ids(input?.lineIds), note: String(input?.note ?? "") });
    refresh();
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function addPayoutRewardAction(input: { who: string; kind: string; amount: string; phone?: string; network?: string; reason: string }): Promise<LedgerResult> {
  const admin = await requireAdminSection("money");
  try {
    const result = await addReward({
      adminId: admin.id,
      who: String(input?.who ?? "").slice(0, 120),
      kind: String(input?.kind ?? ""),
      amount: String(input?.amount ?? "").slice(0, 20),
      phone: String(input?.phone ?? "").slice(0, 30),
      network: String(input?.network ?? "").slice(0, 20),
      reason: String(input?.reason ?? ""),
    });
    refresh();
    return result;
  } catch (error) {
    return failed(error);
  }
}

export async function closePayoutWeekAction(payday: string): Promise<LedgerResult> {
  const admin = await requireAdminSection("money");
  const day = cleanPayday(payday);
  if (!day) return { ok: false, error: "That isn't a Friday." };
  try {
    const result = await closeWeek({ adminId: admin.id, payday: day });
    refresh();
    return result;
  } catch (error) {
    return failed(error);
  }
}
