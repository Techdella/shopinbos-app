"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/server-auth";
import { decideDispute } from "@/lib/faults/disputes.server";
import { clearSupplierReview } from "@/lib/faults/strikes.server";

// The team's side of who pays when things go wrong (shared/fault-matrix.ts): decide a customer's report from the matrix
// (the outcome the evidence points to comes pre-selected) and close a supplier's 3-strike review.

type Result = { ok: true } | { ok: false; error: string };

async function admin() {
  const user = await getCurrentAppUser();
  return user?.role === "admin" ? user : null;
}

function refresh() {
  for (const path of ["/admin/delivery-issues", "/admin/money-owed", "/home/wallet", "/supplier/wallet", "/logistics/wallet"]) revalidatePath(path);
}

/** event "" means nobody owes anything (the report is closed with the reason). */
export async function decideDisputeAction(issueId: string, input: { event: string; remedy: string; partKeys: string[]; note: string }): Promise<Result> {
  const user = await admin();
  if (!user) return { ok: false, error: "Only the Shopinbos team can do this." };
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
