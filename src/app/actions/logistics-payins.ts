"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { recheckPartnerPayIns } from "@/lib/logistics/payins.server";

// "I've paid. Check again" on the partner's late pay-in card (web). Looks for new transfers into their pay-in
// account and refreshes their late standing (lib/logistics/payins.server.ts recheckPartnerPayIns).

export type CheckAgainResult = { ok: true; cleared: boolean; message: string } | { ok: false; message: string };

export async function checkMyPayInsAgain(): Promise<CheckAgainResult> {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!partner) return { ok: false, message: "We couldn't find your company. Log out and in again." };
  const result = await recheckPartnerPayIns(partner.id);
  revalidatePath("/logistics/dashboard");
  revalidatePath("/logistics/cash");
  if (!result.ok) return { ok: false, message: result.error };
  if (result.overdue <= 0) return { ok: true, cleared: true, message: "We found your payment. Thanks, you're back to getting all jobs." };
  return { ok: true, cleared: false, message: "We haven't seen a new payment yet. Transfers can take a few minutes to arrive. Try again soon." };
}
