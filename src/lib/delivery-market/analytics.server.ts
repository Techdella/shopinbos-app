import "server-only";
import { db } from "@/lib/db/client";
import {
  comparePartners,
  deliveryAnalytics,
  destinationState,
  rangeFor,
  type AnalyticsIssue,
  type AnalyticsJob,
  type AnalyticsRangeDays,
  type DeliveryAnalytics,
  type PartnerComparisonRow,
} from "./analytics";

// Loads the rows behind delivery analytics (the sums are in ./analytics.ts): a delivery partner's marketplace jobs,
// or a seller's/supplier's deliveries (DeliveryBooking.sellerId), with each job's customer state and the customer
// problems reported in the same period.

const MAX_JOBS = 20_000;

const JOB_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  deliveryFee: true,
  acceptBy: true,
  acceptedAt: true,
  declinedAt: true,
  declineReason: true,
  pickedUpAt: true,
  deliveredAt: true,
  estimatedDelivery: true,
  failedAttempts: true,
  feePaidAt: true,
  replacedById: true,
  service: true,
  sizeBand: true,
  destination: true,
  orderId: true,
  logisticsPartnerId: true,
} as const;

type JobRow = AnalyticsJob & { id: string; destination: string; orderId: string | null };

/** Adds each job's customer state: from its order's delivery address, else from the destination text. */
async function withStates(rows: Array<Omit<JobRow, "state">>): Promise<JobRow[]> {
  const orderIds = [...new Set(rows.map((row) => row.orderId).filter((id): id is string => !!id))];
  const orders = orderIds.length ? await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, deliveryAddress: true } }) : [];
  const addresses = new Map(orders.map((order) => [order.id, order.deliveryAddress]));
  return rows.map((row) => ({ ...row, state: destinationState(row.orderId ? addresses.get(row.orderId) : null, row.destination) }));
}

export interface PartnerAnalytics extends DeliveryAnalytics {
  days: AnalyticsRangeDays;
}

/** A delivery partner's marketplace jobs (offered through shops' connections) over the last `days` days. */
export async function partnerMarketAnalytics(partnerId: string, days: AnalyticsRangeDays, now = new Date()): Promise<PartnerAnalytics> {
  const range = rangeFor(days, now);
  const [rows, issues] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partnerId, shipmentKey: { not: null }, createdAt: { gte: range.from } },
      select: JOB_SELECT,
      orderBy: { createdAt: "desc" },
      take: MAX_JOBS,
    }),
    db.deliveryIssue.findMany({
      where: { logisticsPartnerId: partnerId, createdAt: { gte: range.from } },
      select: { kind: true, status: true, createdAt: true, logisticsPartnerId: true },
      take: MAX_JOBS,
    }),
  ]);
  const jobs = await withStates(rows);
  return { ...deliveryAnalytics({ jobs, issues, range, now }), days };
}

export interface OwnerAnalytics extends DeliveryAnalytics {
  days: AnalyticsRangeDays;
  partners: PartnerComparisonRow[];
  /** Exceptions in the period: declines, jobs not accepted in time, failed attempts and returns. */
  exceptions: number;
}

/**
 * A seller's or supplier's deliveries over the last `days` days (every booking they made, marketplace or not), the
 * customer problems on them, and how each partner did. Sellers' problems come from their store; suppliers' from
 * their own jobs.
 */
export async function ownerDeliveryAnalytics(owner: { id: string; role: string }, days: AnalyticsRangeDays, now = new Date()): Promise<OwnerAnalytics> {
  const range = rangeFor(days, now);
  const [rows, connections, store] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { sellerId: owner.id, createdAt: { gte: range.from } },
      select: JOB_SELECT,
      orderBy: { createdAt: "desc" },
      take: MAX_JOBS,
    }),
    db.deliveryConnection.findMany({
      where: { ownerUserId: owner.id, status: "active" },
      orderBy: { createdAt: "asc" },
      select: { logisticsPartner: { select: { id: true, displayName: true } } },
    }),
    owner.role === "seller" ? db.store.findUnique({ where: { userId: owner.id }, select: { id: true } }) : Promise.resolve(null),
  ]);
  const jobs = await withStates(rows);

  const issueWhere = store
    ? { storeId: store.id, createdAt: { gte: range.from } }
    : { bookingId: { in: jobs.map((job) => job.id) }, createdAt: { gte: range.from } };
  const issues: AnalyticsIssue[] = store || jobs.length
    ? await db.deliveryIssue.findMany({ where: issueWhere, select: { kind: true, status: true, createdAt: true, logisticsPartnerId: true }, take: MAX_JOBS })
    : [];

  const connected = connections.map((connection) => ({ id: connection.logisticsPartner.id, name: connection.logisticsPartner.displayName, connected: true }));
  const known = new Set(connected.map((partner) => partner.id));
  const otherIds = [...new Set(jobs.map((job) => job.logisticsPartnerId).filter((id): id is string => !!id && !known.has(id)))];
  const others = otherIds.length
    ? await db.logisticsPartner.findMany({ where: { id: { in: otherIds } }, select: { id: true, displayName: true } })
    : [];
  const partners = comparePartners(jobs, [...connected, ...others.map((partner) => ({ id: partner.id, name: partner.displayName, connected: false }))], now);

  const analytics = deliveryAnalytics({ jobs, issues, range, now });
  const t = analytics.totals;
  return { ...analytics, days, partners, exceptions: t.declined + t.notAcceptedInTime + t.failedAttempts + t.returned };
}
