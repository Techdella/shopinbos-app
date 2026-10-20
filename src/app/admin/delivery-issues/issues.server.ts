import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { ISSUE_WORDS, type IssueKind } from "@shared/delivery-market";

// Customers' delivery problems (DeliveryIssue) for the team: with the order number, the shop and the partner, so
// they can moderate and keep an eye on partner ratings. DeliveryIssue has ids only (no relations to orders or
// stores), so the names are looked up in one go.

export interface AdminIssueRow {
  id: string;
  kind: string;
  kindLabel: string;
  message: string | null;
  reporterName: string | null;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  orderId: string;
  orderNumber: string | null;
  storeName: string | null;
  storeSlug: string | null;
  partner: { id: string; displayName: string } | null;
}

export const issueKindLabel = (kind: string) => ISSUE_WORDS[kind as IssueKind] ?? kind;

export async function adminIssueRows(where: Prisma.DeliveryIssueWhereInput, take = 100): Promise<AdminIssueRow[]> {
  const issues = await db.deliveryIssue.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: { logisticsPartner: { select: { id: true, displayName: true } } },
  });
  if (!issues.length) return [];
  const [orders, stores] = await Promise.all([
    db.retailOrder.findMany({ where: { id: { in: [...new Set(issues.map((issue) => issue.retailOrderId))] } }, select: { id: true, orderNumber: true } }),
    db.store.findMany({ where: { id: { in: [...new Set(issues.map((issue) => issue.storeId))] } }, select: { id: true, name: true, slug: true } }),
  ]);
  const orderOf = new Map(orders.map((order) => [order.id, order.orderNumber]));
  const storeOf = new Map(stores.map((store) => [store.id, store]));
  return issues.map((issue) => ({
    id: issue.id,
    kind: issue.kind,
    kindLabel: issueKindLabel(issue.kind),
    message: issue.message,
    reporterName: issue.reporterName,
    status: issue.status,
    createdAt: issue.createdAt,
    resolvedAt: issue.resolvedAt,
    orderId: issue.retailOrderId,
    orderNumber: orderOf.get(issue.retailOrderId) ?? null,
    storeName: storeOf.get(issue.storeId)?.name ?? null,
    storeSlug: storeOf.get(issue.storeId)?.slug ?? null,
    partner: issue.logisticsPartner,
  }));
}
