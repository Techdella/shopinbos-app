"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/server-auth";
import { decideDispute } from "@/lib/faults/disputes.server";
import { sellerDecidesFault } from "@/lib/faults/customer.server";
import { clearSupplierReview } from "@/lib/faults/strikes.server";

// Who pays when things go wrong (shared/fault-matrix.ts). The shop is the seller's business, so the seller decides:
// their customer's report (the outcome the evidence points to comes pre-selected) and the outcomes Shopinbos suggests
// (out of stock, a late part the customer asked to cancel, a delivery that came back, a return that's back). The team
// only closes a supplier's 3-strike review.

type Result = { ok: true } | { ok: false; error: string };

async function admin() {
  const user = await getCurrentAppUser();
  return user?.role === "admin" ? user : null;
}

function refresh() {
  for (const path of ["/admin/delivery-issues", "/admin/money-owed", "/home/wallet", "/supplier/wallet", "/logistics/wallet"]) revalidatePath(path);
}

async function seller() {
  const user = await getCurrentAppUser();
  return user?.role === "seller" ? user : null;
}

/** event "" means nobody owes anything (the report is closed with the reason). The shop's owner only. */
export async function decideDisputeAction(issueId: string, input: { event: string; remedy: string; partKeys: string[]; note: string }): Promise<Result> {
  const user = await seller();
  if (!user) return { ok: false, error: "Sign in to your shop again." };
  const result = await decideDispute(user, String(issueId ?? "").slice(0, 40), {
    event: input.event ? String(input.event).slice(0, 40) : null,
    remedy: input.remedy === "replacement" ? "replacement" : "refund",
    partKeys: Array.isArray(input.partKeys) ? input.partKeys.map((key) => String(key).slice(0, 80)).slice(0, 10) : [],
    note: String(input.note ?? "").slice(0, 2000),
  });
  refresh();
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function clearSupplierReviewAction(supplierId: string, note: string): Promise<Result> {
  const user = await admin();
  if (!user) return { ok: false, error: "Only the Shopinbos team can do this." };
  const result = await clearSupplierReview(String(supplierId ?? "").slice(0, 40), String(note ?? ""));
  refresh();
  return result;
}

/** The seller accepts a suggested outcome (it applies now) or handles it themselves (nothing happens). */
export async function decideFaultAction(caseId: string, accept: boolean): Promise<Result & { message?: string }> {
  const user = await seller();
  if (!user) return { ok: false, error: "Sign in to your shop again." };
  const result = await sellerDecidesFault(user.id, String(caseId ?? "").slice(0, 40), accept === true);
  refresh();
  revalidatePath("/home/orders");
  return result.ok ? { ok: true, message: result.message } : { ok: false, error: result.error };
}
