import "server-only";
import { db } from "@/lib/db/client";
import { FAULT_EVENTS, FAULT_LABELS, REPLACEABLE, faultProblem, isFaultEvent, resolveFault, suggestFault, type FaultEvent, type FaultOutcome, type Remedy } from "@shared/fault-matrix";
import { applyFault, loadFaultFacts } from "./resolve.server";

// "Report a problem": the customer's report (wrong item, damaged, not received) with every photo side by side (the
// supplier's contents and sealed-parcel photos, the rider's pickup and handover photos, the customer's), the outcome
// the evidence points to pre-selected (shared/fault-matrix.ts suggestFault), and what each choice would mean for
// everyone. It's the shop's customer, so the seller decides (like Shopify: Shopinbos only suggests); money moves only
// through the seller's refund and money owed between the businesses. The team sees it read-only.

export interface DisputeEvidence {
  partKey: string;
  partLabel: string;
  photos: Array<{ label: string; url: string | null; by: string }>;
  suggested: FaultEvent | null;
  why: string;
}

/** One report with its evidence and the resolver's outcome for each event the team might pick. */
export async function disputeView(issueId: string) {
  const issue = await db.deliveryIssue.findUnique({ where: { id: issueId } });
  if (!issue) return null;
  const facts = await loadFaultFacts(issue.retailOrderId);
  if (!facts) return null;
  const store = await db.store.findUnique({ where: { id: issue.storeId }, select: { name: true, slug: true } });
  const parts: DisputeEvidence[] = facts.faultOrder.parts.map((part) => {
    const ev = facts.evidence(part.key);
    const supplier = part.supplierId ? facts.supplierOrders.find((row) => row.supplierId === part.supplierId)?.supplier.displayName ?? "Supplier" : store?.name ?? "The shop";
    const suggestion = suggestFault(issue.kind, ev);
    return {
      partKey: part.key,
      partLabel: part.supplierId ? `${supplier}'s parcel` : "The shop's own items",
      photos: [
        { label: "Item in the open box", url: ev.photos.contents, by: supplier },
        { label: "Sealed parcel", url: ev.photos.sealed, by: supplier },
        { label: "Sealed parcel at pickup", url: ev.photos.pickup, by: "Rider" },
        { label: "Handover", url: ev.photos.handover, by: "Rider" },
      ],
      suggested: suggestion.event,
      why: suggestion.why,
    };
  });
  const suggested = parts.find((part) => part.suggested)?.suggested ?? null;
  const previewFor = (event: FaultEvent, remedy: Remedy = "refund", partKeys?: string[]): FaultOutcome | null => {
    const input = { event, order: facts.faultOrder, remedy, partKeys };
    return faultProblem(input) ? null : resolveFault(input);
  };
  const decided = issue.faultCaseId ? await db.faultCase.findUnique({ where: { id: issue.faultCaseId } }) : null;
  return {
    issue: { id: issue.id, kind: issue.kind, message: issue.message, reporterName: issue.reporterName, photos: issue.photos, status: issue.status, createdAt: issue.createdAt.toISOString() },
    order: { id: facts.order.id, orderNumber: facts.order.orderNumber, total: facts.order.total, store: store?.name ?? null, storeSlug: store?.slug ?? null, paymentMethod: facts.order.paymentMethod, split: facts.faultOrder.split },
    parts,
    suggested,
    events: FAULT_EVENTS.filter((event) => event !== "changed_mind").map((event) => ({ event, label: FAULT_LABELS[event], replaceable: REPLACEABLE.includes(event) })),
    preview: previewFor,
    decided: decided ? { event: decided.event, remedy: decided.remedy, outcome: decided.outcome as unknown as FaultOutcome, note: decided.note, createdAt: decided.createdAt.toISOString() } : null,
  };
}

/**
 * The seller's decision on their customer's report: an outcome from the matrix (applied once: refund and money owed)
 * or "nobody owes" (event null, with the reason). Closes the report.
 */
export async function decideDispute(seller: { id: string }, issueId: string, input: { event: string | null; remedy?: string | null; partKeys?: string[]; note: string }) {
  const issue = await db.deliveryIssue.findUnique({ where: { id: issueId } });
  const owner = issue ? await db.store.findUnique({ where: { id: issue.storeId }, select: { userId: true } }) : null;
  if (!issue || owner?.userId !== seller.id) return { ok: false as const, error: "We couldn't find this report." };
  if (issue.faultCaseId) return { ok: false as const, error: "This report has already been decided." };
  const note = input.note.trim().slice(0, 1500);
  if (note.length < 5) return { ok: false as const, error: "Say why in a few words: your supplier and delivery partner see it." };
  if (!input.event) {
    await db.deliveryIssue.update({ where: { id: issue.id }, data: { status: "resolved", resolvedAt: new Date() } });
    return { ok: true as const, outcome: null };
  }
  if (!isFaultEvent(input.event) || input.event === "changed_mind") return { ok: false as const, error: "Pick what happened." };
  const applied = await applyFault({
    key: `issue:${issue.id}`,
    source: "report",
    retailOrderId: issue.retailOrderId,
    event: input.event,
    remedy: input.remedy === "replacement" ? "replacement" : "refund",
    partKeys: input.partKeys?.filter(Boolean).length ? input.partKeys : undefined,
    note,
    decidedByUserId: seller.id,
    bookTrips: true,
  });
  if (!applied.ok) return { ok: false as const, error: applied.error };
  await db.deliveryIssue.update({ where: { id: issue.id }, data: { status: "resolved", resolvedAt: new Date(), faultCaseId: applied.caseId } });
  return { ok: true as const, outcome: applied.outcome };
}

/** Open reports that can go through the matrix (wrong item, damaged, not received), newest first. */
export async function openDisputes(take = 50) {
  return db.deliveryIssue.findMany({ where: { status: "open", kind: { in: ["wrong_item", "damaged", "not_delivered"] } }, orderBy: { createdAt: "desc" }, take, select: { id: true } });
}
