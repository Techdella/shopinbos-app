import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { refreshSupplierLevel } from "@/lib/supplier-levels.server";
import { NG_REGIONS, NG_STATES } from "@shared/delivery-market";
import {
  DEFAULT_ZONE_RATES,
  DELIVERY_ZONES,
  STICKERS_LOW,
  brandingOfferFor,
  cleanZoneRates,
  isBrandingChoice,
  isRateSource,
  isSupplierLevel,
  packChecklist,
  packReadyProblem,
  readBrandingOffer,
  readZoneRates,
  stickersAfterUse,
  supplierPerks,
  type BrandingChoice,
  type RateSource,
  type SupplierLevel,
  type ZoneRates,
} from "@shared/dropship-rules";
import { supplierOrderRef } from "@/lib/supplier-orders/pure";

// The supplier's side of the Supplier & Dropship Rules (shared/dropship-rules.ts has the pure rules), shared by the
// web portal (/supplier/delivery, /supplier/branding, the order page) and the JSON API the phone app uses:
//   Delivery rate card   Shopinbos partner rates (default) or the supplier's own zone × size prices.
//   Branding you offer   packing slips and the seller's stickers from Trusted up; custom packaging any time.
//   Pack it the seller's way   the checklist on a dropship order, the sealed-parcel photo, the sticker count.

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

// ─── Branding you offer ──────────────────────────────────────────────────────

export async function supplierBrandingView(supplierId: string) {
  const level: SupplierLevel = (await refreshSupplierLevel(supplierId).catch(() => null)) ?? "new";
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { level: true, brandingOffer: true } });
  const current = isSupplierLevel(supplier?.level) ? supplier.level : level;
  return { offer: brandingOfferFor(current, readBrandingOffer(supplier?.brandingOffer)), level: current, allowed: supplierPerks(current).branding };
}

export type BrandingView = Awaited<ReturnType<typeof supplierBrandingView>>;

/** Saves the branding offer. New suppliers keep blind packing (and custom packaging) only: brandingOfferFor drops the rest. */
export async function saveSupplierBranding(supplierId: string, input: unknown): Promise<BrandingView> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { level: true } });
  const offer = brandingOfferFor(supplier?.level, readBrandingOffer(input));
  await db.supplier.update({ where: { id: supplierId }, data: { brandingOffer: offer as unknown as Prisma.InputJsonValue } });
  return supplierBrandingView(supplierId);
}

// ─── Pack it the seller's way (dropship orders) ──────────────────────────────

export interface OrderBranding {
  sellerName: string;
  logoUrl: string | null;
  choice: BrandingChoice;
  fee: number;
  skus: string[];
}

/** The branding snapshot saved on a SupplierOrder when it was created (older orders: blind, the shop's name). */
export function readOrderBranding(value: unknown, fallbackName = "The shop"): OrderBranding {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fee = Number(source.fee);
  return {
    sellerName: typeof source.sellerName === "string" && source.sellerName.trim() ? source.sellerName.trim() : fallbackName,
    logoUrl: typeof source.logoUrl === "string" && /^https?:\/\//.test(source.logoUrl) ? source.logoUrl : null,
    choice: isBrandingChoice(source.choice) ? source.choice : "blind",
    fee: Number.isFinite(fee) && fee > 0 ? fee : 0,
    skus: Array.isArray(source.skus) ? source.skus.filter((sku): sku is string => typeof sku === "string" && sku.trim() !== "").map((sku) => sku.trim().slice(0, 60)).slice(0, 20) : [],
  };
}

const PACK_SELECT = {
  id: true, supplierId: true, sellerId: true, status: true, packedAt: true, branding: true, packSteps: true, packPhotoUrl: true, storeId: true,
} as const satisfies Prisma.SupplierOrderSelect;

type PackRow = Prisma.SupplierOrderGetPayload<{ select: typeof PACK_SELECT }>;

async function stickersLeftFor(row: { supplierId: string; sellerId: string }) {
  const agreement = await db.supplierAgreement.findUnique({ where: { sellerId_supplierId: { sellerId: row.sellerId, supplierId: row.supplierId } }, select: { stickerPackLeft: true } });
  return agreement?.stickerPackLeft ?? null;
}

async function packViewOf(row: PackRow, shopName?: string) {
  const name = shopName ?? (await db.store.findUnique({ where: { id: row.storeId }, select: { name: true } }))?.name ?? "The shop";
  const branding = readOrderBranding(row.branding, name);
  const stickersLeft = branding.choice === "stickers" ? await stickersLeftFor(row) : null;
  const steps = packChecklist({ sellerName: branding.sellerName, choice: branding.choice, orderCode: supplierOrderRef(row.id), stickersLeft, skus: branding.skus });
  const done = row.packSteps.filter((id) => steps.some((step) => step.id === id));
  return {
    orderId: row.id,
    branding,
    steps: steps.map((step) => ({ ...step, done: step.id === "photo" ? Boolean(row.packPhotoUrl) : done.includes(step.id) })),
    packSteps: done,
    photoUrl: row.packPhotoUrl,
    stickersLeft,
    packed: Boolean(row.packedAt),
    // Orders made before the checklist existed carry no branding snapshot: they keep the old one-tap "packed".
    problem: legacyOrder(row.branding) ? null : packReadyProblem(steps, done, row.packPhotoUrl),
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

/** Ticks checklist steps and saves the sealed-parcel photo, until the order is packed. */
export async function savePackProgress(supplierId: string, orderId: string, input: { steps?: unknown; photoUrl?: unknown }): Promise<{ ok: true; data: PackView } | Fail> {
  const row = await db.supplierOrder.findFirst({ where: { id: orderId, supplierId }, select: PACK_SELECT });
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Order not found" };
  if (!["pending", "accepted"].includes(row.status) || row.packedAt) return { ok: false, code: "CONFLICT", message: "This order is already packed or has moved on. Refresh to see where it is." };
  const photoUrl = cleanPhotoUrl(input.photoUrl);
  if (input.photoUrl !== undefined && photoUrl === undefined) return { ok: false, code: "BAD_REQUEST", message: "Upload the photo again: that link didn't work." };
  const data: Prisma.SupplierOrderUpdateInput = {};
  if (input.steps !== undefined) {
    if (!Array.isArray(input.steps)) return { ok: false, code: "BAD_REQUEST", message: "Send the steps you've done." };
    const known = new Set(["plain", "slip", "sticker", "code"]);
    data.packSteps = [...new Set(input.steps.map(String).filter((id) => known.has(id)))];
  }
  if (photoUrl !== undefined) data.packPhotoUrl = photoUrl;
  if (Object.keys(data).length) await db.supplierOrder.update({ where: { id: row.id }, data });
  return { ok: true, data: (await dropshipPackView(supplierId, orderId))! };
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

/** After a parcel packed with the seller's stickers: one fewer in their pack, and a heads-up when it's low. */
export async function useSellerSticker(orderId: string) {
  const row = await db.supplierOrder.findUnique({ where: { id: orderId }, select: { ...PACK_SELECT, supplier: { select: { displayName: true } } } });
  if (!row || readOrderBranding(row.branding).choice !== "stickers") return;
  const left = await stickersLeftFor(row);
  const next = stickersAfterUse(left);
  if (next.left === null) return;
  const moved = await db.supplierAgreement.updateMany({ where: { sellerId: row.sellerId, supplierId: row.supplierId, stickerPackLeft: left }, data: { stickerPackLeft: next.left } });
  if (moved.count !== 1 || !next.low) return;
  const supplierName = row.supplier.displayName || "Your supplier";
  await createNotification({
    userId: row.sellerId,
    type: "dropshipping",
    priority: next.left === 0 ? "critical" : "warning",
    title: next.left === 0 ? `${supplierName} has used your last sticker` : `${next.left} of your stickers left at ${supplierName}`,
    description: next.left === 0
      ? `Send ${supplierName} a new pack of stickers or bags. Until then your parcels go out blind, with your name on tracking.`
      : `Your sticker or bag pack at ${supplierName} is running low (${STICKERS_LOW} or fewer). Send a new pack so your parcels keep your branding.`,
    link: "/home/orders",
    event: "supplier.update",
    dedupeKey: `stickers.low:${row.supplierId}:${row.sellerId}:${next.left}`,
  }).catch(() => null);
}
