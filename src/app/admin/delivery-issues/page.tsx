import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, EmptyState, FilterChips, PillLink } from "@/components/app-kit";
import { CountRow, adminFrame, withParams } from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { adminIssueRows } from "./issues.server";
import { IssueList } from "./IssueList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery problems" };

const FILTERS = ["open", "resolved"] as const;

// Customers' delivery problems ("It's late", "It wasn't delivered", ...) across every shop, newest first, for
// moderation and partner ratings. Shops resolve their own; the team can too.
export default async function AdminDeliveryIssuesPage(props: { searchParams?: Promise<{ status?: string; partner?: string; saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const params = (await props.searchParams) ?? {};
  const status = (FILTERS as readonly string[]).includes(params.status ?? "") ? (params.status as (typeof FILTERS)[number]) : "open";
  const partnerId = params.partner?.trim() || undefined;

  const [rows, counts, partner, week] = await Promise.all([
    adminIssueRows({ status, ...(partnerId ? { logisticsPartnerId: partnerId } : {}) }, 200),
    db.deliveryIssue.groupBy({ by: ["status"], where: partnerId ? { logisticsPartnerId: partnerId } : {}, _count: { _all: true } }),
    partnerId ? db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { id: true, displayName: true } }) : null,
    db.deliveryIssue.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, ...(partnerId ? { logisticsPartnerId: partnerId } : {}) } }),
  ]);
  const countOf = (value: string) => counts.find((row) => row.status === value)?._count._all ?? 0;
  const backTo = withParams("/admin/delivery-issues", { status, partner: partnerId });

  return (
    <AppPage
      frame={adminFrame(user, "Search logistics partners")}
      title="Delivery problems"
      sub={partner ? `Problems customers reported with ${partner.displayName}'s deliveries.` : "Problems customers reported with their deliveries, newest first. Shops see their own and resolve them; partners hear about late, missing and damaged deliveries."}
      actions={
        <>
          {partner && <PillLink href={`/admin/logistics-partners/${partner.id}`} icon="arrowLeft">{partner.displayName}</PillLink>}
          <PillLink href="/admin/logistics-partners" icon="truck">Logistics partners</PillLink>
        </>
      }
      toolbar={
        <FilterChips
          items={FILTERS.map((value) => ({
            label: value === "open" ? "Open" : "Resolved",
            count: countOf(value),
            href: withParams("/admin/delivery-issues", { status: value, partner: partnerId }),
            active: status === value,
          }))}
        />
      }
    >
      {(params.saved || params.error) && (
        <p role="status" className={`mb-4 rounded-[14px] px-4 py-3 text-[14.5px] font-bold ${params.error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {params.error ?? params.saved}
        </p>
      )}

      <CountRow
        items={[
          { label: "Open", value: countOf("open") },
          { label: "Resolved", value: countOf("resolved") },
          { label: "Reported in the last 7 days", value: week },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon="truck" title={status === "open" ? "No open delivery problems" : "Nothing resolved yet"}>
          {status === "open" ? "When a customer reports a late, missing or damaged delivery, it shows up here." : "Problems marked resolved by shops or the team show up here."}
        </EmptyState>
      ) : (
        <IssueList rows={rows} returnTo={backTo} />
      )}
      {partnerId && !partner && (
        <p className="mt-4 text-[13.5px] text-app-ink-soft">
          That partner no longer exists. <Link href="/admin/delivery-issues" className="font-bold text-app-ink underline">See all problems</Link>
        </p>
      )}
      <p className="mt-4 text-[12.5px] text-app-ink-faint">Showing up to 200, newest first.</p>
    </AppPage>
  );
}
