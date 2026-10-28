"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/server-auth";
import { adminDecideRefund, type RefundDecision } from "@/lib/commerce/order-refunds.server";

const DECISIONS: RefundDecision[] = ["received", "resend", "cancel"];

/** The team's decision on a refund (src/lib/commerce/order-refunds.server.ts). */
export async function decideRefundAction(refundId: string, decision: RefundDecision, note?: string) {
  const user = await getCurrentAppUser();
  if (user?.role !== "admin") return { ok: false as const, error: "Sign in again." };
  if (!DECISIONS.includes(decision)) return { ok: false as const, error: "Pick a decision." };
  const result = await adminDecideRefund(String(refundId).slice(0, 40), decision, typeof note === "string" ? note : undefined);
  revalidatePath("/admin/refunds");
  return result;
}
