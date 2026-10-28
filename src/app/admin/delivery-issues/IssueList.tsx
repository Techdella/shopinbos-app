import Link from "next/link";
import { resolveDeliveryIssueAdmin } from "@/app/actions/admin";
import { ListCard, Pill } from "@/components/app-kit";
import { buttonClass, formatDate } from "@/components/admin/AdminKit";
import type { AdminIssueRow } from "./issues.server";

/** Customers' delivery problems as rows, each with "Mark resolved" while open. Used on /admin/delivery-issues and a partner's page. */
export function IssueList({ rows, returnTo, showPartner = true }: { rows: AdminIssueRow[]; returnTo: string; showPartner?: boolean }) {
  return (
    <ListCard>
      {rows.map((issue) => (
        <li key={issue.id} className="flex flex-wrap items-start gap-x-4 gap-y-2.5 px-4 py-3.5 sm:px-5 lg:flex-nowrap">
          <div className="min-w-0 flex-1 basis-[240px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-extrabold">{issue.kindLabel}</span>
              <Pill tone={issue.status === "open" ? (issue.kind === "late" ? "warning" : "danger") : "success"} dot>
                {issue.status === "open" ? "Open" : "Resolved"}
              </Pill>
            </div>
            <div className="mt-0.5 text-[13px] text-app-ink-soft">
              Order {issue.orderNumber ?? issue.orderId.slice(-8)}
              {issue.storeName ? ` · ${issue.storeName}` : ""}
              {issue.reporterName ? ` · reported by ${issue.reporterName}` : ""}
            </div>
            {issue.message && <p className="mb-0 mt-1.5 max-w-[720px] whitespace-pre-wrap break-words text-[14px]">{issue.message}</p>}
          </div>
          <div className="w-full text-[13px] text-app-ink-soft sm:w-auto lg:w-[220px] lg:shrink-0 lg:text-right">
            {showPartner && (
              <div className="truncate">
                {issue.partner ? (
                  <Link href={`/admin/logistics-partners/${issue.partner.id}`} className="font-bold text-app-ink no-underline hover:underline">{issue.partner.displayName}</Link>
                ) : (
                  "No partner (the shop's own delivery)"
                )}
              </div>
            )}
            <div>Reported {formatDate(issue.createdAt)}</div>
            {issue.resolvedAt && <div>Resolved {formatDate(issue.resolvedAt)}</div>}
          </div>
          {/* Wrong item, damaged, not received: the evidence side by side and who pays (shared/fault-matrix.ts). */}
          {["wrong_item", "damaged", "not_delivered"].includes(issue.kind) && (
            <Link href={`/admin/delivery-issues/${issue.id}`} className={`${buttonClass(issue.status === "open" ? "ink" : "white", "sm")} shrink-0 no-underline`}>{issue.status === "open" ? "Decide who pays" : "See the outcome"}</Link>
          )}
          {issue.status === "open" && (
            <form action={resolveDeliveryIssueAdmin} className="shrink-0">
              <input type="hidden" name="issueId" value={issue.id} />
              <input type="hidden" name="redirectTo" value={returnTo} />
              <button type="submit" className={buttonClass("white", "sm")} aria-label={`Mark the problem with order ${issue.orderNumber ?? ""} resolved`}>Mark resolved</button>
            </form>
          )}
        </li>
      ))}
    </ListCard>
  );
}
