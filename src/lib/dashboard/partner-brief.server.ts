import "server-only";
import { db } from "@/lib/db/client";
import { DROPSHIP_TO_SHIP, WHOLESALE_TO_SHIP } from "@/lib/supplier-orders/pure";
import { cashToPayIn } from "@/lib/logistics/job-rules";
import { owedAfterCredit } from "@/lib/logistics/payin-rules";
import { partnerBrief, supplierBrief, type BriefItem, type PartnerFacts, type SupplierFacts } from "@shared/partner-brief";
import { tFor } from "@shared/i18n/catalog";
import type { Locale } from "@shared/i18n";

// The numbers behind Peggy's brief and Rex's ideas for suppliers and delivery partners (shared/partner-brief.ts has
// the rules). Each count is the business's own, read the same way its pages read them. Never throws: a failed
// query leaves that item out instead of breaking the dashboard.

const HOUR_MS = 60 * 60 * 1000;
const safe = <T,>(work: Promise<T>, fallback: T) => work.catch((error) => { console.error("[partner brief]", error); return fallback; });

/** Contracts waiting for this account's signature and disputes open on its contracts. */
async function contractFacts(userId: string) {
  const [awaiting, disputesOpen] = await Promise.all([
    safe(db.contract.findMany({ where: { partyBUserId: userId, status: "awaiting" }, select: { supplierAgreementId: true } }), []),
    safe(db.contract.count({ where: { disputeStatus: "open", OR: [{ partyAUserId: userId }, { partyBUserId: userId }] } }), 0),
  ]);
  // A shop's dropship request waiting is counted as a request (it's signed where it's accepted), not twice.
  const requestIds = awaiting.map((row) => row.supplierAgreementId).filter((id): id is string => Boolean(id));
  const requested = requestIds.length ? await safe(db.supplierAgreement.count({ where: { id: { in: requestIds }, status: "requested" } }), 0) : 0;
  return { contractsToSign: awaiting.length - requested, disputesOpen };
}

async function walletReady(userId: string) {
  return (await safe(db.wallet.count({ where: { userId, status: "active", subaccountStatus: "active" } }), 1)) > 0;
}

export async function supplierFacts(supplier: { id: string; userId: string; verificationStatus: string; returnPolicy: string | null; logoUrl: string | null; description: string | null; missedOrders: number }, now = new Date()): Promise<SupplierFacts> {
  const soon = new Date(now.getTime() + HOUR_MS);
  const [dropAccept, dropSoon, wholeAccept, wholeSoon, dropSend, wholeSend, quotes, agreementRequests, contracts, owedOverdue, wallet, products, published, drafts, stock, deliveryPartners, settings] = await Promise.all([
    safe(db.supplierOrder.count({ where: { supplierId: supplier.id, status: "pending" } }), 0),
    safe(db.supplierOrder.count({ where: { supplierId: supplier.id, status: "pending", acceptBy: { lte: soon } } }), 0),
    safe(db.wholesaleOrder.count({ where: { supplierId: supplier.id, status: "pending" } }), 0),
    safe(db.wholesaleOrder.count({ where: { supplierId: supplier.id, status: "pending", acceptBy: { lte: soon } } }), 0),
    safe(db.supplierOrder.count({ where: { supplierId: supplier.id, status: { in: DROPSHIP_TO_SHIP.filter((status) => status !== "pending") } } }), 0),
    safe(db.wholesaleOrder.count({ where: { supplierId: supplier.id, status: { in: WHOLESALE_TO_SHIP.filter((status) => status !== "pending") } } }), 0),
    safe(db.supplierQuoteRequest.count({ where: { supplierId: supplier.id, status: "pending" } }), 0),
    safe(db.supplierAgreement.count({ where: { supplierId: supplier.id, status: "requested" } }), 0),
    contractFacts(supplier.userId),
    safe(db.businessDebt.count({ where: { debtorUserId: supplier.userId, status: "open", dueAt: { lte: now } } }), 0),
    walletReady(supplier.userId),
    safe(db.supplierProduct.count({ where: { supplierId: supplier.id } }), 0),
    safe(db.supplierProduct.count({ where: { supplierId: supplier.id, status: "published" } }), 0),
    safe(db.supplierProduct.count({ where: { supplierId: supplier.id, status: "draft" } }), 0),
    safe(db.supplierProduct.findMany({ where: { supplierId: supplier.id, status: "published" }, select: { stockQuantity: true, moq: true }, take: 500 }), []),
    safe(db.deliveryConnection.count({ where: { ownerUserId: supplier.userId, status: "active" } }), 0),
    safe(db.deliverySettings.findUnique({ where: { userId: supplier.userId }, select: { selfDelivery: true } }), null),
  ]);
  return {
    verificationStatus: supplier.verificationStatus,
    toAccept: dropAccept + wholeAccept,
    dueSoon: dropSoon + wholeSoon,
    toSend: dropSend + wholeSend,
    quotes,
    agreementRequests,
    ...contracts,
    owedOverdue,
    walletReady: wallet,
    products,
    published,
    drafts,
    // The same "running low" line as the dashboard's product list: under the MOQ, or under 5.
    lowStock: stock.filter((row) => (row.stockQuantity ?? 0) < Math.max(row.moq ?? 1, 5)).length,
    hasReturnPolicy: Boolean(supplier.returnPolicy?.trim()),
    hasLogo: Boolean(supplier.logoUrl),
    hasDescription: Boolean(supplier.description?.trim()),
    missedOrders: supplier.missedOrders,
    deliveryPartners,
    selfDelivery: Boolean(settings?.selfDelivery),
  };
}

export async function supplierBriefFor(supplier: Parameters<typeof supplierFacts>[0], now = new Date()) {
  const facts = await supplierFacts(supplier, now);
  return { facts, ...supplierBrief(facts) };
}

export async function partnerFacts(partner: { id: string; userId: string; verificationStatus: string; deliveryAreas: string[]; coverageZones: string[]; offersPayOnDelivery: boolean; payInCredit: number; payInOverdueSince: Date | null; payInOverdueAmount: number; rating: number; ratingCount: number }, now = new Date()): Promise<PartnerFacts> {
  const soon = new Date(now.getTime() + HOUR_MS);
  const [newJobs, dueSoon, quotes, unassigned, riders, unremitted, contracts, wallet, rateCards, privateRateCards, pickupPoints, connections] = await Promise.all([
    safe(db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "pending" } }), 0),
    safe(db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "pending", acceptBy: { lte: soon } } }), 0),
    safe(db.deliveryQuoteRequest.count({ where: { logisticsPartnerId: partner.id, status: "pending" } }), 0),
    safe(db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "confirmed", riderId: null } }), 0),
    safe(db.logisticsTeamMember.count({ where: { logisticsPartnerId: partner.id, role: "rider", status: "active" } }), 0),
    safe(db.deliveryBooking.findMany({ where: { logisticsPartnerId: partner.id, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } }, select: { codCollected: true, codMethod: true, remittanceId: true } }), []),
    contractFacts(partner.userId),
    walletReady(partner.userId),
    safe(db.logisticsRateCard.count({ where: { logisticsPartnerId: partner.id, ownerUserId: null, status: "active" } }), 0),
    safe(db.logisticsRateCard.count({ where: { logisticsPartnerId: partner.id, ownerUserId: { not: null }, status: { in: ["proposed", "accepted"] } } }), 0),
    safe(db.logisticsPickupPoint.count({ where: { logisticsPartnerId: partner.id } }), 0),
    safe(db.deliveryConnection.count({ where: { logisticsPartnerId: partner.id, status: "active" } }), 0),
  ]);
  return {
    verificationStatus: partner.verificationStatus,
    newJobs,
    dueSoon,
    quotes,
    unassigned,
    riders,
    payInOverdue: Boolean(partner.payInOverdueSince) && partner.payInOverdueAmount > 0,
    cashToPayIn: owedAfterCredit(cashToPayIn(unremitted), partner.payInCredit),
    ...contracts,
    walletReady: wallet,
    hasRateCard: rateCards > 0,
    hasCoverage: partner.deliveryAreas.length > 0 || partner.coverageZones.length > 0,
    pickupPoints,
    offersPayOnDelivery: partner.offersPayOnDelivery,
    connections,
    privateRateCards,
    rating: partner.rating,
    ratingCount: partner.ratingCount,
  };
}

export async function partnerBriefFor(partner: Parameters<typeof partnerFacts>[0], now = new Date()) {
  const facts = await partnerFacts(partner, now);
  return { facts, ...partnerBrief(facts) };
}

// ─── For the assistants (help chat, Rex drawer, morning notification) ─────────

const PARTNER_SELECT = { id: true, userId: true, verificationStatus: true, deliveryAreas: true, coverageZones: true, offersPayOnDelivery: true, payInCredit: true, payInOverdueSince: true, payInOverdueAmount: true, rating: true, ratingCount: true } as const;
const SUPPLIER_SELECT = { id: true, userId: true, verificationStatus: true, returnPolicy: true, logoUrl: true, description: true, missedOrders: true } as const;

export type UserBrief = { role: "supplier" | "partner"; peggy: BriefItem[]; rex: BriefItem[] };

/** The brief of a supplier or delivery partner account, or null for other roles (and accounts not set up yet). */
export async function briefForUser(user: { id: string; role: string }, now = new Date()): Promise<UserBrief | null> {
  if (user.role === "supplier") {
    const supplier = await safe(db.supplier.findUnique({ where: { userId: user.id }, select: SUPPLIER_SELECT }), null);
    return supplier ? { role: "supplier", ...supplierBrief(await supplierFacts(supplier, now)) } : null;
  }
  if (user.role === "logistics_partner") {
    const partner = await safe(db.logisticsPartner.findUnique({ where: { userId: user.id }, select: PARTNER_SELECT }), null);
    return partner ? { role: "partner", ...partnerBrief(await partnerFacts(partner, now)) } : null;
  }
  return null;
}

/** Each item as one plain English line ("3 new orders to accept: Shops are waiting… (/supplier/orders)"), for AI prompts. */
export function briefLines(brief: UserBrief, which: "peggy" | "rex"): string[] {
  const t = tFor("en", "briefs");
  return brief[which].map((item) => {
    const vars = item.count === undefined ? undefined : { count: item.count };
    return `${item.urgent ? "[urgent] " : ""}${t.dynamic(`${brief.role}.${item.key}.title`, item.key, vars)}: ${t.dynamic(`${brief.role}.${item.key}.hint`, "", vars)} (${item.href})`;
  });
}

/** Item titles only, for suggestion chips and notifications, in the person's language. */
export function briefTitles(brief: UserBrief, which: "peggy" | "rex", locale: Locale = "en"): string[] {
  const t = tFor(locale, "briefs");
  return brief[which].map((item) => t.dynamic(`${brief.role}.${item.key}.title`, item.key, item.count === undefined ? undefined : { count: item.count }));
}
