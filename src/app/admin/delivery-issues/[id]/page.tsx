import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame, formatDate } from "@/components/admin/AdminKit";
import { requireRole } from "@/lib/server-auth";
import { disputeView } from "@/lib/faults/disputes.server";
import { isFaultEvent } from "@shared/fault-matrix";
import { issueKindLabel } from "../issues.server";
import { DisputeBody } from "@/components/faults/DisputeView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Problem report" };

// One customer report ("Report a problem": wrong item, damaged, not received), read-only for the team: the evidence
// and what the shop decided. The shop is the seller's business, so the seller decides on their customer's report
// (src/app/home/orders/[id]/problems/[issueId]); the team referees only disputes between businesses (Money owed).

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
