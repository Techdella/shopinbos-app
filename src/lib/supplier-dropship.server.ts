import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { NG_REGIONS, NG_STATES } from "@shared/delivery-market";
import {
  DEFAULT_ZONE_RATES,
  DELIVERY_ZONES,
  cleanZoneRates,
  isRateSource,
  packChecklist,
  packReadyProblem,
  readZoneRates,
  type RateSource,
  type ZoneRates,
} from "@shared/dropship-rules";
import { supplierOrderRef } from "@/lib/supplier-orders/pure";

// The supplier's side of the Supplier & Dropship Rules (shared/dropship-rules.ts has the pure rules), shared by the
// web portal (/supplier/delivery, the order page) and the JSON API the phone app uses:
//   Delivery rate card   Shopinbos partner rates (default) or the supplier's own zone × size prices.
//   Pack it plain        the checklist on a dropship order (always blind: suppliers don't offer seller branding)
//                        and the two packing photos.

type Fail = { ok: false; code: string; message: string };

// ─── Delivery rate card ──────────────────────────────────────────────────────

export interface DeliveryRatesView {
  rateSource: RateSource;
  zoneRates: ZoneRates;
  originState: string | null;
  originArea: string | null;
  defaults: ZoneRates;
}

export async function supplierDeliveryRates(userId: string): Promise<DeliveryRatesView> {
  const row = await db.deliverySettings.findUnique({ where: { userId }, select: { rateSource: true, zoneRates: true, originState: true, originArea: true } });
  return {
    rateSource: isRateSource(row?.rateSource) ? row.rateSource : "partners",
    zoneRates: readZoneRates(row?.zoneRates),
    originState: row?.originState ?? null,
    originArea: row?.originArea ?? null,
    defaults: DEFAULT_ZONE_RATES,
  };
}

/** The states a supplier's own card reaches: everywhere with a "rest of Nigeria" price, its region with a "nearby" one. */
export function statesCoveredBy(rates: ZoneRates, originState: string): string[] {
  const priced = (zone: (typeof DELIVERY_ZONES)[number]) => Object.keys(rates[zone]).length > 0;
  if (priced("rest")) return [...NG_STATES];
  if (priced("nearby")) {
    const region = Object.values(NG_REGIONS).find((states) => (states as readonly string[]).includes(originState));
    if (region) return [...region];
  }
  return [originState];
}

/** The dearest price on the card: what an older checkout charges for the supplier's own delivery (never a loss). */
export function dearestRate(rates: ZoneRates): number {
  return Math.max(0, ...DELIVERY_ZONES.flatMap((zone) => Object.values(rates[zone]).filter((price): price is number => typeof price === "number")));
}

/**
 * Saves where the supplier's delivery prices come from. Their own card means their own courier delivers (the
 * selfDelivery columns checkout reads); partner rates switch that off and keep the card for later.
 */
export async function saveSupplierDeliveryRates(userId: string, input: { rateSource?: unknown; zoneRates?: unknown }): Promise<{ ok: true; data: DeliveryRatesView } | Fail> {
  if (!isRateSource(input.rateSource)) return { ok: false, code: "BAD_REQUEST", message: "Choose Shopinbos partner rates or your own rates." };
  const current = await db.deliverySettings.findUnique({ where: { userId }, select: { originState: true, zoneRates: true } });
  let data: Prisma.DeliverySettingsUncheckedCreateInput;
  if (input.rateSource === "own") {
    const cleaned = cleanZoneRates(input.zoneRates);
    if (!cleaned.ok) return { ok: false, code: "invalid_rates", message: cleaned.message };
    if (!current?.originState) return { ok: false, code: "BAD_REQUEST", message: "Add the state your parcels leave from first, so we know which zone each customer is in." };
    data = {
      userId,
      rateSource: "own",
      zoneRates: cleaned.value as unknown as Prisma.InputJsonValue,
      selfDelivery: true,
      selfDeliveryFee: dearestRate(cleaned.value),
      selfDeliveryStates: statesCoveredBy(cleaned.value, current.originState),
    };
  } else {
    data = { userId, rateSource: "partners", selfDelivery: false };
    // A card sent along is kept for later (checked first), so switching back doesn't lose it.
    if (input.zoneRates !== undefined) {
      const cleaned = cleanZoneRates(input.zoneRates);
      if (cleaned.ok) data.zoneRates = cleaned.value as unknown as Prisma.InputJsonValue;
    }
  }
  const { userId: _id, ...update } = data;
  void _id;
  await db.deliverySettings.upsert({ where: { userId }, update, create: data });
  return { ok: true, data: await supplierDeliveryRates(userId) };
}

// ─── Pack it plain (dropship orders) ─────────────────────────────────────────

/** The seller snapshot on a SupplierOrder. Every dropship parcel is packed blind, so choice and fee never vary. */
export interface OrderBranding {
  sellerName: string;
  logoUrl: string | null;
  choice: "blind";
  fee: 0;
  skus: string[];
}

/** The seller snapshot saved on a SupplierOrder when it was created (older orders: the shop's name). Always blind. */
export function readOrderBranding(value: unknown, fallbackName = "The shop"): OrderBranding {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    sellerName: typeof source.sellerName === "string" && source.sellerName.trim() ? source.sellerName.trim() : fallbackName,
    logoUrl: typeof source.logoUrl === "string" && /^https?:\/\//.test(source.logoUrl) ? source.logoUrl : null,
    choice: "blind",
    fee: 0,
    skus: Array.isArray(source.skus) ? source.skus.filter((sku): sku is string => typeof sku === "string" && sku.trim() !== "").map((sku) => sku.trim().slice(0, 60)).slice(0, 20) : [],
  };
}

const PACK_SELECT = {
  id: true, supplierId: true, sellerId: true, status: true, packedAt: true, branding: true, packSteps: true, packPhotoUrl: true, contentsPhotoUrl: true, storeId: true,
} as const satisfies Prisma.SupplierOrderSelect;

type PackRow = Prisma.SupplierOrderGetPayload<{ select: typeof PACK_SELECT }>;

async function packViewOf(row: PackRow, shopName?: string) {
  const name = shopName ?? (await db.store.findUnique({ where: { id: row.storeId }, select: { name: true } }))?.name ?? "The shop";
  const branding = readOrderBranding(row.branding, name);
  const steps = packChecklist({ orderCode: supplierOrderRef(row.id) });
  const done = row.packSteps.filter((id) => steps.some((step) => step.id === id));
  return {
    orderId: row.id,
    branding,
    kind: "dropship" as "dropship" | "wholesale",
    steps: steps.map((step) => ({ ...step, done: step.id === "photo" ? Boolean(row.packPhotoUrl) : step.id === "contents" ? Boolean(row.contentsPhotoUrl) : done.includes(step.id) })),
    packSteps: done,
    photoUrl: row.packPhotoUrl,
    /** The item in the open box, before sealing (shared/fault-matrix.ts: the packing photos decide most disputes). */
    contentsPhotoUrl: row.contentsPhotoUrl,
    packed: Boolean(row.packedAt),
    // Orders made before the checklist existed carry no branding snapshot: they keep the old one-tap "packed".
    problem: legacyOrder(row.branding) ? null : packReadyProblem(steps, done, row.packPhotoUrl, row.contentsPhotoUrl),
  };
}

export type PackView = Awaited<ReturnType<typeof packViewOf>>;

export async function dropshipPackView(supplierId: string, orderId: string, shopName?: string): Promise<PackView | null> {
  const row = await db.supplierOrder.findFirst({ where: { id: orderId, supplierId }, select: PACK_SELECT });
  return row ? packViewOf(row, shopName) : null;
}

/** A picture link from the media library upload (POST /api/app/media): a web URL, not too long. */
export function cleanPhotoUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const url = String(value).trim();
  return /^https?:\/\/[^\s"'<>]{4,1000}$/.test(url) ? url : undefined;
}

/** Ticks checklist steps and saves the packing photos (the item in the open box, the sealed parcel), until it's packed. */
export async function savePackProgress(supplierId: string, orderId: string, input: { steps?: unknown; photoUrl?: unknown; contentsPhotoUrl?: unknown }): Promise<{ ok: true; data: PackView } | Fail> {
  const row = await db.supplierOrder.findFirst({ where: { id: orderId, supplierId }, select: PACK_SELECT });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (!["pending", "accepted"].includes(row.status) || row.packedAt) return { ok: false, code: "CONFLICT", message: "This order is already packed or has moved on. Refresh to see where it is." };
  const photoUrl = cleanPhotoUrl(input.photoUrl);
  if (input.photoUrl !== undefined && photoUrl === undefined) return { ok: false, code: "BAD_REQUEST", message: "Upload the photo again: that link didn't work." };
  const data: Prisma.SupplierOrderUpdateInput = {};
  if (input.steps !== undefined) {
    if (!Array.isArray(input.steps)) return { ok: false, code: "BAD_REQUEST", message: "Send the steps you've done." };
    const known = new Set(["plain", "code"]);
    data.packSteps = [...new Set(input.steps.map(String).filter((id) => known.has(id)))];
  }
  if (photoUrl !== undefined) data.packPhotoUrl = photoUrl;
  const contentsUrl = cleanPhotoUrl(input.contentsPhotoUrl);
  if (input.contentsPhotoUrl !== undefined && contentsUrl === undefined) return { ok: false, code: "BAD_REQUEST", message: "Upload the photo again: that link didn't work." };
  if (contentsUrl !== undefined) data.contentsPhotoUrl = contentsUrl;
  if (Object.keys(data).length) await db.supplierOrder.update({ where: { id: row.id }, data });
  return { ok: true, data: (await dropshipPackView(supplierId, orderId))! };
}

// ─── Wholesale: the same two packing photos before it leaves ────────────────

const WHOLESALE_PACK_SELECT = { id: true, supplierId: true, status: true, packPhotoUrl: true, contentsPhotoUrl: true, seller: { select: { name: true, store: { select: { name: true, logoUrl: true } } } } } as const satisfies Prisma.WholesaleOrderSelect;

type WholesalePackRow = Prisma.WholesaleOrderGetPayload<{ select: typeof WHOLESALE_PACK_SELECT }>;

/** A wholesale order's packing: only the two photos (no seller branding). Same shape as the dropship PackView. */
function wholesalePackViewOf(row: WholesalePackRow): PackView {
  const steps = packChecklist({ orderCode: supplierOrderRef(row.id) }).filter((step) => step.id === "contents" || step.id === "photo");
  return {
    orderId: row.id,
    kind: "wholesale",
    branding: { sellerName: row.seller.store?.name ?? row.seller.name ?? "The shop", logoUrl: row.seller.store?.logoUrl ?? null, choice: "blind", fee: 0, skus: [] },
    steps: steps.map((step) => ({ ...step, done: step.id === "photo" ? Boolean(row.packPhotoUrl) : Boolean(row.contentsPhotoUrl) })),
    packSteps: [],
    photoUrl: row.packPhotoUrl,
    contentsPhotoUrl: row.contentsPhotoUrl,
    packed: !["pending", "confirmed"].includes(String(row.status)),
    problem: packReadyProblem(steps, [], row.packPhotoUrl, row.contentsPhotoUrl),
  };
}

export async function wholesalePackView(supplierId: string, orderId: string): Promise<PackView | null> {
  const row = await db.wholesaleOrder.findFirst({ where: { id: orderId, supplierId }, select: WHOLESALE_PACK_SELECT });
  return row ? wholesalePackViewOf(row) : null;
}

/** Saves a wholesale order's packing photos while it's still to be packed. */
export async function saveWholesalePackPhotos(supplierId: string, orderId: string, input: { photoUrl?: unknown; contentsPhotoUrl?: unknown }): Promise<{ ok: true; data: PackView } | Fail> {
  const row = await db.wholesaleOrder.findFirst({ where: { id: orderId, supplierId }, select: WHOLESALE_PACK_SELECT });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (!["pending", "confirmed"].includes(String(row.status))) return { ok: false, code: "CONFLICT", message: "This order is already packed or has moved on. Refresh to see where it is." };
  const photoUrl = cleanPhotoUrl(input.photoUrl);
  const contentsUrl = cleanPhotoUrl(input.contentsPhotoUrl);
  if ((input.photoUrl !== undefined && photoUrl === undefined) || (input.contentsPhotoUrl !== undefined && contentsUrl === undefined)) return { ok: false, code: "BAD_REQUEST", message: "Upload the photo again: that link didn't work." };
  const data: Prisma.WholesaleOrderUpdateInput = {};
  if (photoUrl !== undefined) data.packPhotoUrl = photoUrl;
  if (contentsUrl !== undefined) data.contentsPhotoUrl = contentsUrl;
  if (Object.keys(data).length) await db.wholesaleOrder.update({ where: { id: row.id }, data });
  return { ok: true, data: (await wholesalePackView(supplierId, orderId))! };
}

/** Why a wholesale order can't be marked packed yet: a packing photo missing. */
export async function wholesalePackProblem(orderId: string): Promise<string | null> {
  const row = await db.wholesaleOrder.findUnique({ where: { id: orderId }, select: WHOLESALE_PACK_SELECT });
  return row ? wholesalePackViewOf(row).problem : null;
}

/** Why this dropship order can't be marked packed (or sent) yet: a step left, or no sealed-parcel photo. */
export async function dropshipPackProblem(orderId: string): Promise<string | null> {
  const row = await db.supplierOrder.findUnique({ where: { id: orderId }, select: PACK_SELECT });
  if (!row) return null;
  return (await packViewOf(row)).problem;
}

/** No branding snapshot: the order was made before the pack checklist existed. */
function legacyOrder(branding: unknown) {
  return !branding || typeof branding !== "object" || Array.isArray(branding) || !Object.keys(branding).length;
}
