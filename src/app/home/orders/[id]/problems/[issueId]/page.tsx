import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { disputeView } from "@/lib/faults/disputes.server";
import { isFaultEvent } from "@shared/fault-matrix";
import { DisputeBody } from "@/components/faults/DisputeView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Decide a problem" };

// The seller decides their customer's report ("Report a problem": wrong item, damaged, not received). It's the shop's
// customer, so it's the shop's call (like Shopify): every photo side by side, the outcome the evidence points to
// pre-selected (shared/fault-matrix.ts suggestFault), and what each choice means for the customer, the supplier, the
// shop and the delivery partner. Confirming applies it once (src/lib/faults/disputes.server.ts decideDispute).

const KIND: Record<string, string> = { wrong_item: "Wrong item", damaged: "Arrived damaged", not_delivered: "Not received" };

export default async function SellerProblemPage({ params, searchParams }: { params: Promise<{ id: string; issueId: string }>; searchParams?: Promise<{ event?: string; remedy?: string; part?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const { id, issueId } = await params;
  const query = (await searchParams) ?? {};
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, currency: true, slug: true, logoUrl: true } });
  if (!store) notFound();
  const issue = await db.deliveryIssue.findFirst({ where: { id: issueId, storeId: store.id, retailOrderId: id }, select: { id: true } });
  if (!issue) notFound();
  const view = await disputeView(issue.id);
  if (!view) notFound();
  const selected = query.event === "none" ? "none" : isFaultEvent(query.event) ? query.event : view.suggested ?? "none";
  const remedy = query.remedy === "replacement" ? "replacement" : "refund";
  const part = query.part && (query.part === "all" || view.parts.some((row) => row.partKey === query.part)) ? query.part : view.parts.find((row) => row.suggested)?.partKey ?? view.parts[0]?.partKey ?? "all";
  const replaceable = view.events.find((row) => row.event === selected)?.replaceable ?? false;
  const preview = selected !== "none" && isFaultEvent(selected) ? view.preview(selected, replaceable ? remedy : "refund", part === "all" ? undefined : [part]) : null;
  const basePath = `/home/orders/${encodeURIComponent(id)}/problems/${encodeURIComponent(issue.id)}`;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={`${KIND[view.issue.kind] ?? "Problem"}: order ${view.order.orderNumber}`}
      sub={`Reported ${new Date(view.issue.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", timeZone: "Africa/Lagos" })}${view.issue.reporterName ? ` by ${view.issue.reporterName}` : ""}. It's your customer, so it's your call.`}
      actions={<PillLink href={`/home/orders/${id}#problems`} icon="arrowLeft">Back to the order</PillLink>}
    >
      <DisputeBody issue={view.issue} parts={view.parts} events={view.events} selected={selected} remedy={remedy} part={part} preview={preview} decided={view.decided} basePath={basePath} />
    </AppPage>
  );
}
