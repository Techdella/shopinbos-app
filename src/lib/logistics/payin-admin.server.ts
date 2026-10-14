import "server-only";
import { db } from "@/lib/db/client";
import { payInKey } from "./payin-deadline";
import { refreshPayInStanding } from "./payin-standing.server";
import { recordRemittance } from "./remittances";

// The team's actions on a late partner (Admin → Delivery partners): "Mark as settled" (with a reason), "Unpause",
// and recording a pay-in the partner made some other way. Each is saved in PartnerPayInEvent for the history.

type Result = { ok: true; message: string } | { ok: false; error: string };

/**
 * "Mark as settled": the overdue cash is settled outside a transfer (paid at the office, a mistake on our side…).
 * Saves a pay-in of the overdue amount with method "settled" and the reason, so the oldest late jobs are ticked off
 * like any pay-in, then refreshes the standing (which clears the flag and tells the partner).
 */
export async function markPayInSettled(input: { partnerId: string; reason: string; adminUserId: string; now?: Date }): Promise<Result> {
  const reason = input.reason.trim().slice(0, 300);
  if (reason.length < 3) return { ok: false, error: "Write why it's settled, so the team can see it later." };
  const now = input.now ?? new Date();
  // Make sure the overdue amount is up to date before settling it.
  await refreshPayInStanding(input.partnerId, now);
  const partner = await db.logisticsPartner.findUnique({ where: { id: input.partnerId }, select: { payInOverdueAmount: true, payInOverdueSince: true } });
  if (!partner) return { ok: false, error: "That delivery partner is gone." };
  if (!partner.payInOverdueSince || partner.payInOverdueAmount <= 0) {
    return { ok: false, error: "Nothing is overdue for this partner now. Refresh the page." };
  }
  const saved = await recordRemittance({
    partnerId: input.partnerId,
    amount: partner.payInOverdueAmount,
    method: "settled",
    reference: null,
    note: `Marked as settled by the Shopinbos team: ${reason}`,
  });
  if (!saved.ok) return { ok: false, error: saved.error };
  await db.partnerPayInEvent.create({
    data: {
      logisticsPartnerId: input.partnerId,
      kind: "settled",
      dedupeKey: payInKey("settled", input.partnerId, now, Math.floor(Math.random() * 1e9)),
      amount: partner.payInOverdueAmount,
      deadline: partner.payInOverdueSince,
      note: reason,
      adminUserId: input.adminUserId,
    },
  });
  // recordRemittance refreshed the standing already; once more in case anything moved meanwhile.
  await refreshPayInStanding(input.partnerId);
  return { ok: true, message: "Marked as settled. The partner is back to getting all jobs and has been told." };
}

/**
 * "Unpause": lets a late partner get cash-on-delivery jobs again while they're still late. The late flag stays
 * (and escalation carries on); the cron won't pause them again until this late period is paid in.
 */
export async function unpausePartner(input: { partnerId: string; adminUserId: string; reason?: string | null; now?: Date }): Promise<Result> {
  const now = input.now ?? new Date();
  const partner = await db.logisticsPartner.findUnique({ where: { id: input.partnerId }, select: { codPaused: true, payInOverdueSince: true, payInOverdueAmount: true } });
  if (!partner) return { ok: false, error: "That delivery partner is gone." };
  if (!partner.codPaused) return { ok: false, error: "This partner isn't paused. Refresh the page." };
  await db.logisticsPartner.update({
    where: { id: input.partnerId },
    data: partner.payInOverdueSince ? { codPaused: false, payInPauseWaived: true } : { codPaused: false, payInPauseWaived: false },
  });
  await db.partnerPayInEvent.create({
    data: {
      logisticsPartnerId: input.partnerId,
      kind: "unpaused",
      dedupeKey: payInKey("unpaused", input.partnerId, now, Math.floor(Math.random() * 1e9)),
      amount: partner.payInOverdueAmount,
      deadline: partner.payInOverdueSince,
      note: input.reason?.trim().slice(0, 300) || null,
      adminUserId: input.adminUserId,
    },
  });
  return { ok: true, message: "Unpaused. They get cash-on-delivery jobs again; the late cash is still owed." };
}

/** A pay-in the partner made some other way (cash at the office, a transfer to the main account), recorded by the team. */
export async function recordTeamPayIn(input: { partnerId: string; amount: number; method: "transfer" | "cash"; note?: string | null; adminUserId: string }): Promise<Result> {
  const partner = await db.logisticsPartner.findUnique({ where: { id: input.partnerId }, select: { id: true } });
  if (!partner) return { ok: false, error: "That delivery partner is gone." };
  const note = input.note?.trim() ? `Recorded by the Shopinbos team: ${input.note.trim()}` : "Recorded by the Shopinbos team";
  const saved = await recordRemittance({ partnerId: input.partnerId, amount: input.amount, method: input.method, reference: null, note });
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, message: `Pay-in saved. It settled ${saved.jobIds.length} ${saved.jobIds.length === 1 ? "job" : "jobs"}.` };
}
