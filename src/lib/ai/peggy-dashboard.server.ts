import "server-only";

import { db } from "@/lib/db/client";
import { computeDashboard, startOfLagosDay, stockLabel, type DashboardOrder, type DashboardProduct } from "@/lib/dashboard/compute";
import { partnerFacts, supplierFacts } from "@/lib/dashboard/partner-brief.server";
import { getSellerOnboardingStatus } from "@/lib/onboarding-status";
import { sellerPlan } from "@/lib/plans/gates.server";
import { creditBalance } from "@/lib/ai/credits.server";
import { ACTIVE_JOB_STATUSES } from "@/lib/logistics/rider-location";
import type { SetupStatus } from "@/lib/onboarding/setup-status.server";
import { PLAN_NAMES } from "@shared/plans";
import { partnerSnapshot, sellerSnapshot, supplierSnapshot } from "./peggy-dashboard";

// The dashboard snapshot Peggy gets on a call ({{dashboard}} and the get_dashboard tool), read with the dashboards' own
// helpers: the seller home's order and stock rules (lib/dashboard/compute.ts), the supplier and delivery partner
// briefs' counts (lib/dashboard/partner-brief.server.ts) and the setup status (so "done" means the same everywhere).
// Never throws: a failed read gives a shorter snapshot, and the call still starts.

const DAY = 86_400_000;
const safe = <T,>(work: Promise<T>, fallback: T) => work.catch((error) => { console.error("[peggy dashboard]", error); return fallback; });
const stepDone = (status: SetupStatus, id: string) => status.steps.some((step) => step.id === id && step.done);

async function sellerText(userId: string, status: SetupStatus, now: Date) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true, name: true } });
  if (!store) return null;
  const today = startOfLagosDay(now);
  const since = new Date(today.getTime() - 29 * DAY);
  const [orders, products, onboarding, plan, credits, unreadChats, reviewsMonth] = await Promise.all([
    safe(db.retailOrder.findMany({ where: { storeId: store.id, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 2000, select: { id: true, orderNumber: true, buyerName: true, buyerEmail: true, items: true, total: true, status: true, createdAt: true, channel: true, deliveryAddress: true, logisticsDetails: true } }), []),
    safe(db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" } }, take: 1000, select: { id: true, name: true, images: true, retailPrice: true, currentStock: true, lowStockThreshold: true, soldStock: true, trackStock: true } }), []),
    safe(getSellerOnboardingStatus(userId), null),
    safe(sellerPlan(userId), null),
    safe(creditBalance(userId), 0),
    safe(db.message.count({ where: { read: false, senderId: { not: userId }, conversation: { OR: [{ participant1Id: userId }, { participant2Id: userId }] } } }), 0),
    safe(db.productReview.count({ where: { storeId: store.id, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }), 0),
  ]);
  const list: DashboardProduct[] = products.map((p) => ({ ...p, retailPrice: Number(p.retailPrice) }));
  const numbers = computeDashboard({ orders: orders.map((o): DashboardOrder => ({ ...o, total: Number(o.total) })), products: list, now });
  const weekStart = today.getTime() - 6 * DAY;
  const stock = list.map((p) => ({ product: p, label: stockLabel(p) }));
  return sellerSnapshot({
    shop: store.name,
    url: onboarding?.store.url ?? null,
    live: stepDone(status, "live"),
    plan: plan ? PLAN_NAMES[plan.key] : "unknown",
    products: products.length,
    lowStock: stock.filter((s) => s.label.low && s.product.currentStock > 0).length,
    outOfStock: stock.filter((s) => s.label.low && s.product.currentStock <= 0).length,
    ordersToday: numbers.ordersToday,
    ordersWeek: orders.filter((o) => o.createdAt.getTime() >= weekStart && o.status !== "cancelled").length,
    unpaid: numbers.ordersAwaitingPayment,
    toSend: numbers.ordersToSend,
    bankSet: stepDone(status, "bank"),
    deliverySet: stepDone(status, "delivery"),
    credits,
    unreadChats,
    reviewsMonth,
  });
}

async function supplierText(userId: string, status: SetupStatus, now: Date) {
  const supplier = await db.supplier.findUnique({ where: { userId }, select: { id: true, userId: true, businessName: true, displayName: true, verificationStatus: true, returnPolicy: true, logoUrl: true, description: true, missedOrders: true } });
  if (!supplier) return null;
  const facts = await supplierFacts(supplier, now);
  return supplierSnapshot({
    business: supplier.displayName || supplier.businessName,
    verification: supplier.verificationStatus,
    products: facts.products,
    published: facts.published,
    lowStock: facts.lowStock,
    toAccept: facts.toAccept,
    toSend: facts.toSend,
    quotes: facts.quotes,
    bankSet: stepDone(status, "bank") || facts.walletReady,
    pickupSet: stepDone(status, "pickup"),
    deliveryPartners: facts.deliveryPartners,
    selfDelivery: facts.selfDelivery,
  });
}

async function partnerText(userId: string, status: SetupStatus, now: Date) {
  const partner = await db.logisticsPartner.findUnique({ where: { userId }, select: { id: true, userId: true, companyName: true, displayName: true, cacNumber: true, basePrice: true, verificationStatus: true, deliveryAreas: true, coverageZones: true, offersPayOnDelivery: true, payInCredit: true, payInOverdueSince: true, payInOverdueAmount: true, rating: true, ratingCount: true } });
  if (!partner) return null;
  const [facts, activeJobs] = await Promise.all([
    partnerFacts(partner, now),
    safe(db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: { in: [...ACTIVE_JOB_STATUSES] } } }), 0),
  ]);
  return partnerSnapshot({
    company: partner.displayName || partner.companyName,
    verification: partner.verificationStatus,
    cacNumber: Boolean(partner.cacNumber?.trim()),
    coverage: [...new Set([...partner.deliveryAreas, ...partner.coverageZones])],
    pickupPoints: facts.pickupPoints,
    ratesSet: stepDone(status, "rates") || facts.hasRateCard,
    startingPrice: partner.basePrice,
    riders: facts.riders,
    newJobs: facts.newJobs,
    activeJobs,
    unassigned: facts.unassigned,
    cashOwed: facts.cashToPayIn,
    bankSet: stepDone(status, "bank") || facts.walletReady,
  });
}

/** The person's dashboard in a few English lines, for Peggy. Null when it can't be read. */
export async function peggyDashboard(userId: string, status: SetupStatus, now = new Date()): Promise<string | null> {
  const work = status.role === "seller" ? sellerText(userId, status, now) : status.role === "supplier" ? supplierText(userId, status, now) : partnerText(userId, status, now);
  return safe(work, null);
}
