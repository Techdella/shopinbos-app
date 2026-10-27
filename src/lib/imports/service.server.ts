import "server-only";

import type { ImportOrder, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { canUseSection } from "@/lib/admin-team/pure";
import {
  IMPORT_STATUS_LABEL,
  PARTNER_NEXT,
  importRef,
  isImportStatus,
  parseImportEvents,
  quoteOpen,
  quoteTotals,
  type ImportEvent,
  type ImportSource,
  type ImportStatus,
  type ImportStep,
} from "./pure";

// China imports, server side: sellers' requests and quotes (src/app/actions/imports.ts), the sourcing partner's
// queue (/admin/imports, /api/admin/imports). The partner collects payment through its own link and holds it until
// delivery; Shopinbos records each step and tells the seller.

export class ImportError extends Error {}

/** Sellers can request imports once the table exists and CHINA_IMPORTS_OPEN=true (the partner is ready). */
export function chinaImportsOpen() {
  return process.env.CHINA_IMPORTS_OPEN === "true";
}

export function importStatus(order: Pick<ImportOrder, "status">): ImportStatus {
  return isImportStatus(order.status) ? order.status : "requested";
}

function withEvent(order: Pick<ImportOrder, "events">, event: Omit<ImportEvent, "at">): Prisma.InputJsonValue {
  return [...parseImportEvents(order.events), { ...event, at: new Date().toISOString() }] as unknown as Prisma.InputJsonValue;
}

// ─── Seller ───────────────────────────────────────────────────────────────────

export interface NewImport {
  storeId: string;
  sellerId: string;
  source: ImportSource;
  title: string;
  link: string | null;
  productRef: string | null;
  photoUrl: string | null;
  quantity: number | null;
  shipping: "air" | "sea";
  notes: string | null;
  destination: string | null;
}

/** A new request with the next IMP-1xxx reference (retried if two land at once). */
export async function createImport(input: NewImport) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const count = await db.importOrder.count();
    const ref = importRef(1001 + count + attempt);
    try {
      return await db.importOrder.create({
        data: { ...input, ref, status: "requested", events: [{ status: "requested", at: new Date().toISOString(), by: "seller" }] },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  throw new ImportError("Couldn't save the request. Try again.");
}

export async function listStoreImports(storeId: string) {
  return db.importOrder.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 100 });
}

async function sellerOrder(id: string, storeId: string) {
  const order = await db.importOrder.findFirst({ where: { id, storeId } });
  if (!order) throw new ImportError("This import isn't in your store.");
  return order;
}

/** The seller accepts the quote; the partner then confirms payment from their side. */
export async function acceptQuote(id: string, storeId: string) {
  const order = await sellerOrder(id, storeId);
  if (!quoteOpen({ status: importStatus(order), quoteValidUntil: order.quoteValidUntil })) throw new ImportError("This quote has expired or was already answered. Ask for a new one.");
  const updated = await db.importOrder.update({
    where: { id },
    data: { acceptedAt: order.acceptedAt ?? new Date(), events: order.acceptedAt ? undefined : withEvent(order, { status: "quoted", by: "seller", note: "Quote accepted" }) },
  });
  if (!order.acceptedAt) await notifyPartner(updated, `${updated.ref} quote accepted`, `${updated.title}: the seller accepted ₦${(updated.total ?? 0).toLocaleString("en-NG")}. Mark it paid when the money reaches you.`);
  return updated;
}

export async function declineQuote(id: string, storeId: string, reason: string | null) {
  const order = await sellerOrder(id, storeId);
  if (importStatus(order) !== "quoted" || order.paidAt) throw new ImportError("This quote can't be declined now.");
  const updated = await db.importOrder.update({
    where: { id },
    data: { status: "declined", declineReason: reason, events: withEvent(order, { status: "declined", by: "seller", note: reason ?? undefined }) },
  });
  await notifyPartner(updated, `${updated.ref} quote declined`, `${updated.title}${reason ? `: "${reason}"` : ""}`);
  return updated;
}

/** The seller cancels before paying (a request they no longer want). */
export async function cancelRequest(id: string, storeId: string) {
  const order = await sellerOrder(id, storeId);
  const status = importStatus(order);
  if (status !== "requested" && !(status === "quoted" && !order.paidAt)) throw new ImportError("It's already paid for. Message us to cancel.");
  const updated = await db.importOrder.update({ where: { id }, data: { status: "cancelled", events: withEvent(order, { status: "cancelled", by: "seller" }) } });
  await notifyPartner(updated, `${updated.ref} cancelled by the seller`, updated.title);
  return updated;
}

export async function linkStoreProduct(id: string, storeProductId: string) {
  return db.importOrder.update({ where: { id }, data: { storeProductId } });
}

// ─── Sourcing partner ─────────────────────────────────────────────────────────

export async function listPartnerImports(statuses: ImportStatus[] | null) {
  const orders = await db.importOrder.findMany({
    where: statuses ? { status: { in: statuses } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return withStores(orders);
}

export async function partnerImportCounts() {
  const rows = await db.importOrder.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Partial<Record<ImportStatus, number>>;
}

export async function getPartnerImport(id: string) {
  const order = await db.importOrder.findUnique({ where: { id } });
  if (!order) return null;
  const [withStore] = await withStores([order]);
  return withStore;
}

async function withStores(orders: ImportOrder[]) {
  const stores = await db.store.findMany({ where: { id: { in: [...new Set(orders.map((order) => order.storeId))] } }, select: { id: true, name: true, slug: true, city: true } });
  const byId = new Map(stores.map((store) => [store.id, store]));
  return orders.map((order) => ({ ...order, store: byId.get(order.storeId) ?? null }));
}

export interface QuoteInput {
  unitPrice: number;
  quantity: number;
  freight: number;
  customs: number;
  serviceFee: number;
  validDays: number;
  estimatedArrival: string | null;
  paymentUrl: string | null;
  quoteNote: string | null;
}

/** Sends (or re-sends) the quote. Allowed before the seller pays. */
export async function sendQuote(id: string, input: QuoteInput) {
  const order = await db.importOrder.findUnique({ where: { id } });
  if (!order) throw new ImportError("Import not found.");
  const status = importStatus(order);
  if (status !== "requested" && !(status === "quoted" && !order.paidAt)) throw new ImportError("It's already paid, so the quote can't change.");
  const { goods, total } = quoteTotals(input);
  const updated = await db.importOrder.update({
    where: { id },
    data: {
      status: "quoted",
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      goodsTotal: goods,
      freight: input.freight,
      customs: input.customs,
      serviceFee: input.serviceFee,
      total,
      quoteValidUntil: new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000),
      estimatedArrival: input.estimatedArrival ? new Date(`${input.estimatedArrival}T12:00:00Z`) : null,
      paymentUrl: input.paymentUrl,
      quoteNote: input.quoteNote,
      quotedAt: new Date(),
      acceptedAt: null,
      events: withEvent(order, { status: "quoted", by: "partner" }),
    },
  });
  await notifySeller(updated, `Your quote for ${updated.ref} is ready`, `${updated.title}: ₦${total.toLocaleString("en-NG")} delivered, customs included. Accept it in My imports.`, "Quote ready");
  return updated;
}

export interface AdvanceInput {
  to: ImportStep;
  carrier?: string | null;
  trackingNumber?: string | null;
  estimatedArrival?: string | null;
  partnerNote?: string | null;
}

const SELLER_STEP_MESSAGE: Partial<Record<ImportStep, string>> = {
  quote_paid: "Payment received. ShopKonfam is ordering it from the factory.",
  bought: "Bought from the factory. It'll be checked before it ships.",
  checked: "Checked in Guangzhou. See the QC photos.",
  shipping: "On its way to Nigeria.",
  customs: "Landed in Lagos and clearing customs.",
  in_stock: "Delivered. Add it to your products and start selling.",
};

/** Moves an order on one step (only the next one, so nothing is skipped by accident). */
export async function advanceImport(id: string, input: AdvanceInput) {
  const order = await db.importOrder.findUnique({ where: { id } });
  if (!order) throw new ImportError("Import not found.");
  const next = PARTNER_NEXT[importStatus(order)];
  if (!next || next.to !== input.to) throw new ImportError(`It's at "${IMPORT_STATUS_LABEL[importStatus(order)]}", so it can't move to that step.`);
  if (input.to === "checked" && order.qcPhotos.length === 0) throw new ImportError("Add at least one QC photo first.");
  const now = new Date();
  const updated = await db.importOrder.update({
    where: { id },
    data: {
      status: input.to,
      ...(input.to === "quote_paid" ? { paidAt: now, acceptedAt: order.acceptedAt ?? now } : {}),
      ...(input.to === "in_stock" ? { deliveredAt: now } : {}),
      ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
      ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
      ...(input.estimatedArrival ? { estimatedArrival: new Date(`${input.estimatedArrival}T12:00:00Z`) } : {}),
      ...(input.partnerNote !== undefined ? { partnerNote: input.partnerNote } : {}),
      events: withEvent(order, { status: input.to, by: "partner" }),
    },
  });
  await notifySeller(updated, `${updated.ref}: ${IMPORT_STATUS_LABEL[input.to]}`, `${updated.title}. ${SELLER_STEP_MESSAGE[input.to] ?? ""}`.trim(), IMPORT_STATUS_LABEL[input.to]);
  return updated;
}

export async function cancelByPartner(id: string, reason: string) {
  const order = await db.importOrder.findUnique({ where: { id } });
  if (!order) throw new ImportError("Import not found.");
  if (importStatus(order) === "in_stock" || importStatus(order) === "cancelled") throw new ImportError("This import is already closed.");
  const updated = await db.importOrder.update({ where: { id }, data: { status: "cancelled", events: withEvent(order, { status: "cancelled", by: "partner", note: reason }) } });
  await notifySeller(updated, `${updated.ref} was cancelled`, `${updated.title}: ${reason}${order.paidAt ? " Your payment will be refunded." : ""}`, "Cancelled");
  return updated;
}

export async function updatePartnerDetails(id: string, data: { partnerNote?: string | null; teamNotes?: string | null; carrier?: string | null; trackingNumber?: string | null; estimatedArrival?: string | null; externalId?: string | null }) {
  const { estimatedArrival, ...rest } = data;
  return db.importOrder.update({
    where: { id },
    data: { ...rest, ...(estimatedArrival !== undefined ? { estimatedArrival: estimatedArrival ? new Date(`${estimatedArrival}T12:00:00Z`) : null } : {}) },
  });
}

export async function setQcPhotos(id: string, qcPhotos: string[]) {
  return db.importOrder.update({ where: { id }, data: { qcPhotos: qcPhotos.slice(0, 12) } });
}

// ─── Notifications ────────────────────────────────────────────────────────────

async function notifySeller(order: ImportOrder, title: string, description: string, actionLabel: string) {
  await createNotification({
    userId: order.sellerId,
    type: "marketplace",
    priority: "info",
    title,
    description,
    link: `/home/imports?open=${order.id}`,
    actionLabel,
    event: "import.update",
    sendEmail: true,
    metadata: { importId: order.id, ref: order.ref },
  }).catch(() => null);
}

/** Everyone on the team whose admin role opens China imports (the partner's staff, owners, operations). */
export async function notifyPartner(order: ImportOrder, title: string, description: string) {
  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true, adminRole: true }, take: 50 }).catch(() => []);
  await Promise.all(
    admins
      .filter((admin) => canUseSection(admin.adminRole, "imports"))
      .map((admin) =>
        createNotification({
          userId: admin.id,
          type: "marketplace",
          priority: "warning",
          title,
          description,
          link: `/admin/imports/${order.id}`,
          event: "admin.review",
          metadata: { importId: order.id, ref: order.ref },
        }).catch(() => null),
      ),
  );
}
