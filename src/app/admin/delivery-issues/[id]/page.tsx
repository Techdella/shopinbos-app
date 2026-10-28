import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame, formatDate } from "@/components/admin/AdminKit";
import { requireRole } from "@/lib/server-auth";
import { disputeView } from "@/lib/faults/disputes.server";
import { isFaultEvent } from "@shared/fault-matrix";
import { issueKindLabel } from "../issues.server";
import { DisputeBody } from "./DisputeView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Decide a problem" };

// One customer report ("Report a problem": wrong item, damaged, not received) for the team: every photo side by side
// (the supplier's item in the open box and sealed parcel, the rider's pickup and handover photos, the customer's),
// the outcome the evidence points to (shared/fault-matrix.ts suggestFault) pre-selected, and what the chosen outcome
// means for the customer, the supplier, the shop and the delivery partner, in naira. Confirming applies it once.

export default async function DisputePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ event?: string; remedy?: string; part?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const view = await disputeView(id);
  if (!view) notFound();
  const selected = query.event === "none" ? "none" : isFaultEvent(query.event) ? query.event : view.suggested ?? "none";
  const remedy = query.remedy === "replacement" ? "replacement" : "refund";
  const part = query.part && (query.part === "all" || view.parts.some((row) => row.partKey === query.part)) ? query.part : view.parts.find((row) => row.suggested)?.partKey ?? view.parts[0]?.partKey ?? "all";
  const replaceable = view.events.find((row) => row.event === selected)?.replaceable ?? false;
  const preview = selected !== "none" && isFaultEvent(selected) ? view.preview(selected, replaceable ? remedy : "refund", part === "all" ? undefined : [part]) : null;

  return (
    <AppPage
      frame={adminFrame(user, "Search logistics partners")}
      title={`${issueKindLabel(view.issue.kind)}: order ${view.order.orderNumber}`}
      sub={`${view.order.store ?? "A shop"} · reported ${formatDate(view.issue.createdAt)}${view.issue.reporterName ? ` by ${view.issue.reporterName}` : ""}`}
      actions={<PillLink href="/admin/delivery-issues" icon="arrowLeft">Delivery problems</PillLink>}
    >
      <DisputeBody issue={view.issue} parts={view.parts} events={view.events} selected={selected} remedy={remedy} part={part} preview={preview} decided={view.decided} />
    </AppPage>
  );
}
