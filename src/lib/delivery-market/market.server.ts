import "server-only";
import { db } from "@/lib/db/client";
import { partnersOverLimit } from "@/lib/logistics/partner-tiers.server";
import {
  buildMarketChoice,
  canonicalState,
  isSizeBand,
  parcelBand,
  placeOf,
  readRateRows,
  selfDeliveryPart,
  type CheckoutSettingsInput,
  type MarketChoice,
  type MarketConnection,
  type OptionPart,
  type Place,
  type Shipment,
  type SizeBand,
} from "@shared/delivery-market";
import { canOfferPayOnDelivery, cleanHandlingDays, customerDeliveryCharge, readZoneRates, zoneRatesEmpty } from "@shared/dropship-rules";
import { applyDeliveryPayers, parcelPayer, type PayerRule } from "@shared/dropship-checkout";

// Reading the logistics marketplace for checkout and the portals: a business's delivery settings, its connected
// partners with the rate card that prices it (an accepted private card, else the public one) and their pickup
// points, and the delivery options for a bag going to an address (shared/delivery-market.ts buildMarketChoice).

export type DeliverySettingsRow = NonNullable<Awaited<ReturnType<typeof db.deliverySettings.findUnique>>>;

export const DEFAULT_SETTINGS: Omit<DeliverySettingsRow, "userId" | "createdAt" | "updatedAt"> = {
  checkoutMode: "zones",
  sellArea: "nationwide",
  sellStates: [],
  originState: null,
  originArea: null,
  originAddress: null,
  selfPickup: false,
  pickupAddress: null,
  pickupHours: null,
  pickupInstructions: null,
  fallback: "pickup_only",
  fallbackFee: 0,
  defaultSizeBand: "small",
  failedFeePayer: "seller",
  selfDelivery: false,
  selfDeliveryFee: 0,
  selfDeliveryStates: [],
  rateSource: "partners",
  zoneRates: {},
};

export async function deliverySettingsFor(userId: string) {
  const row = await db.deliverySettings.findUnique({ where: { userId } });
  return { ...DEFAULT_SETTINGS, ...(row ?? {}), userId };
}

/** Partners a seller or supplier can work with: active, verified, not paused for money owed. */
export const LIVE_PARTNER_WHERE = { status: "active", verificationStatus: "verified" as const, user: { debtPausedAt: null } };

const PARTNER_SELECT = {
  id: true,
  displayName: true,
  services: true,
  pickupAreas: true,
  deliveryAreas: true,
  offersPayOnDelivery: true,
  // Pay on delivery only from Cash trusted partners not paused for late cash (shared/dropship-rules.ts).
  level: true,
  codPaused: true,
  rateCards: { where: { ownerUserId: null, status: "active" }, orderBy: { createdAt: "desc" as const }, take: 1, select: { id: true, rows: true } },
  pickupPoints: { where: { active: true }, select: { id: true, name: true, address: true, state: true, area: true, hours: true, phone: true } },
} as const;

/**
 * The active connections of these businesses, ready for buildMarketChoice. Suspended or paused partners drop out at
 * once. With `orderValue` (checkout), Tier 1 partners it would take over their limits drop out too.
 */
export async function marketConnectionsFor(ownerUserIds: string[], options: { orderValue?: number } = {}): Promise<Map<string, MarketConnection[]>> {
  const out = new Map<string, MarketConnection[]>(ownerUserIds.map((id) => [id, []]));
  if (!ownerUserIds.length) return out;
  const connections = await db.deliveryConnection.findMany({
    where: { ownerUserId: { in: ownerUserIds }, status: "active", logisticsPartner: LIVE_PARTNER_WHERE },
    select: {
      id: true, ownerUserId: true, logisticsPartnerId: true, services: true, showPartnerName: true, label: true, ownerPod: true, partnerPod: true,
      logisticsPartner: { select: PARTNER_SELECT },
    },
  });
  // Private cards the business accepted override the public card, for that business only.
  const privateCards = connections.length
    ? await db.logisticsRateCard.findMany({
        where: { ownerUserId: { in: ownerUserIds }, status: "accepted", logisticsPartnerId: { in: connections.map((connection) => connection.logisticsPartnerId) } },
        orderBy: { respondedAt: "desc" },
        select: { id: true, rows: true, ownerUserId: true, logisticsPartnerId: true },
      })
    : [];
  const overLimit = options.orderValue !== undefined ? await partnersOverLimit([...new Set(connections.map((connection) => connection.logisticsPartnerId))], options.orderValue) : new Set<string>();
  for (const connection of connections) {
    if (overLimit.has(connection.logisticsPartnerId)) continue;
    const partner = connection.logisticsPartner;
    const own = privateCards.find((card) => card.ownerUserId === connection.ownerUserId && card.logisticsPartnerId === connection.logisticsPartnerId);
    const card = own ?? partner.rateCards[0] ?? null;
    out.get(connection.ownerUserId)?.push({
      id: connection.id,
      services: connection.services,
      showPartnerName: connection.showPartnerName,
      label: connection.label,
      ownerPod: connection.ownerPod,
      partnerPod: connection.partnerPod,
      partner: {
        id: partner.id,
        name: partner.displayName,
        services: partner.services,
        pickupAreas: partner.pickupAreas,
        deliveryAreas: partner.deliveryAreas,
        offersPayOnDelivery: partner.offersPayOnDelivery && canOfferPayOnDelivery(partner),
        card: card ? { id: card.id, rows: readRateRows(card.rows) } : null,
        pickupPoints: partner.pickupPoints,
      },
    });
  }
  return out;
}

/** Where a business's parcels leave from: its delivery settings, else its city. */
export function originOf(settings: { originState: string | null; originArea: string | null }, city: string | null | undefined): Place {
  if (settings.originState) return { state: canonicalState(settings.originState), area: settings.originArea || null };
  return placeOf({ city: city ?? "" });
}

export function checkoutSettingsOf(settings: Pick<DeliverySettingsRow, keyof CheckoutSettingsInput>): CheckoutSettingsInput {
  return {
    sellArea: settings.sellArea,
    sellStates: settings.sellStates,
    selfPickup: settings.selfPickup,
    pickupAddress: settings.pickupAddress,
    pickupHours: settings.pickupHours,
    pickupInstructions: settings.pickupInstructions,
    fallback: settings.fallback,
    fallbackFee: settings.fallbackFee,
  };
}

export interface MarketBagItem {
  productId: string;
  quantity: number;
}

/** A supplier delivering with its own rate card (DeliverySettings.rateSource "own" with prices filled in). */
export function usesOwnZoneRates(settings: { rateSource?: string | null; zoneRates?: unknown } | null | undefined): boolean {
  return settings?.rateSource === "own" && !zoneRatesEmpty(readZoneRates(settings.zoneRates));
}

type BagSupplier = { id: string; userId: string; city: string };
type BagGroup = {
  items: Array<{ sizeBand: string | null; weight: number | null; weightUnit: string; quantity: number }>;
  supplier: BagSupplier | null;
  payers: PayerRule[];
  handlingDays: number;
  productIds: string[];
};

/** The bag in parcels: the shop's own items, and one parcel per supplier for dropship items. */
async function bagGroups(storeId: string, items: MarketBagItem[]) {
  const products = await db.storeProduct.findMany({
    where: { storeId, id: { in: [...new Set(items.map((item) => item.productId))] } },
    select: {
      id: true, sizeBand: true, weight: true, weightUnit: true, fulfillmentType: true, deliveryPayer: true, deliveryFlatFee: true,
      supplierProduct: { select: { sizeBand: true, handlingDays: true, supplier: { select: { id: true, userId: true, city: true } } } },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const groups = new Map<string, BagGroup>();
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) continue;
    const supplier = product.fulfillmentType === "dropship" ? product.supplierProduct?.supplier ?? null : null;
    const key = supplier ? `supplier:${supplier.id}` : "own";
    const group = groups.get(key) ?? { items: [], supplier, payers: [], handlingDays: 1, productIds: [] };
    if (!group.productIds.includes(product.id)) group.productIds.push(product.id);
    // A dropship product without its own size takes the supplier's size class for it.
    group.items.push({ sizeBand: product.sizeBand ?? (supplier ? product.supplierProduct?.sizeBand ?? null : null), weight: product.weight, weightUnit: product.weightUnit, quantity: item.quantity });
    if (supplier) {
      group.payers.push({ payer: product.deliveryPayer, flatFee: product.deliveryFlatFee });
      group.handlingDays = Math.max(group.handlingDays, cleanHandlingDays(product.supplierProduct?.handlingDays));
    }
    groups.set(key, group);
  }
  return groups;
}

/** Who pays each supplier parcel's delivery (shared/dropship-checkout.ts parcelPayer), by shipment key. */
function payerRules(groups: Map<string, BagGroup>): Record<string, PayerRule> {
  return Object.fromEntries([...groups].filter(([, group]) => group.supplier).map(([key, group]) => [key, parcelPayer(group.payers)]));
}

/** Where each supplier parcel ships from, for "Ships from Port Harcourt" (by shipment key). */
function originNames(groups: Map<string, BagGroup>, settings: Array<{ userId: string; originArea: string | null; originState: string | null }>): Record<string, string> {
  return Object.fromEntries(
    [...groups].flatMap(([key, group]) => {
      if (!group.supplier) return [];
      const own = settings.find((row) => row.userId === group.supplier!.userId);
      return [[key, group.supplier.city || own?.originArea || own?.originState || ""]];
    }),
  );
}

/**
 * The delivery options for a bag at a store, or null when the store prices delivery with its own zones (the seller
 * hasn't switched checkout to delivery partners). Dropship items ship from their supplier with the supplier's
 * partners (decision 2), or the supplier's own courier at its own zone rates; a supplier with neither falls back to
 * the shop's partners collecting from the supplier. Each supplier parcel's fee to the customer follows who pays
 * delivery for those products (StoreProduct.deliveryPayer): the carrier still gets the full price.
 */
export async function marketChoiceForStore(
  store: { id: string; userId: string; city: string | null },
  items: MarketBagItem[],
  address: { city?: string | null; state?: string | null },
  /** The bag's value in naira: Tier 1 partners take orders up to their limit (shared/partner-tiers.ts). */
  orderValue?: number,
): Promise<{ choice: MarketChoice; shipments: Shipment[]; origins: Record<string, string> } | null> {
  const settings = await deliverySettingsFor(store.userId);
  if (settings.checkoutMode !== "partners") return null;
  const fallbackBand: SizeBand = isSizeBand(settings.defaultSizeBand) ? settings.defaultSizeBand : "small";

  const groups = await bagGroups(store.id, items);
  if (!groups.size) groups.set("own", { items: [], supplier: null, payers: [], handlingDays: 1, productIds: [] });

  const supplierUserIds = [...groups.values()].flatMap((group) => (group.supplier ? [group.supplier.userId] : []));
  const [connections, supplierSettings] = await Promise.all([
    marketConnectionsFor([store.userId, ...supplierUserIds], { orderValue: orderValue ?? 0 }),
    supplierUserIds.length ? db.deliverySettings.findMany({ where: { userId: { in: supplierUserIds } } }) : Promise.resolve([]),
  ]);
  const shopConnections = connections.get(store.userId) ?? [];

  const shipments: Shipment[] = [...groups].map(([key, group]) => {
    if (!group.supplier) {
      return { key, origin: originOf(settings, store.city), sizeBand: parcelBand(group.items, fallbackBand), connections: shopConnections };
    }
    const own = supplierSettings.find((row) => row.userId === group.supplier!.userId);
    const theirs = connections.get(group.supplier.userId) ?? [];
    const zone = usesOwnZoneRates(own);
    return {
      key,
      origin: originOf(own ?? DEFAULT_SETTINGS, group.supplier.city),
      sizeBand: parcelBand(group.items, own && isSizeBand(own.defaultSizeBand) ? own.defaultSizeBand : fallbackBand),
      // "Set my own rates": the supplier's own courier at its card's prices, never a partner's.
      connections: zone ? [] : theirs.length ? theirs : shopConnections,
      selfDelivery: zone
        ? { fee: 0, states: [], zoneRates: own!.zoneRates, handlingDays: group.handlingDays }
        : own?.selfDelivery ? { fee: own.selfDeliveryFee, states: own.selfDeliveryStates } : null,
    };
  });

  const built = buildMarketChoice({ settings: checkoutSettingsOf(settings), shipments, destination: placeOf(address) });
  const choice = applyDeliveryPayers(built, payerRules(groups));
  return { choice, shipments, origins: originNames(groups, supplierSettings) };
}

/**
 * Stores that price delivery with their own zones: dropship items from suppliers with their own zone rates still
 * ship as the supplier's own parcels, each with its fee (from the supplier's card, the customer's address and the
 * parcel's size) added on top of the store's zone fee, the way a marketplace shows "2 parcels". Items from other
 * suppliers, or that a supplier's card doesn't reach, stay with the store's zones as before.
 */
export async function supplierParcelsForZones(
  store: { id: string; userId: string; city: string | null },
  items: MarketBagItem[],
  address: { city?: string | null; state?: string | null },
): Promise<{ parts: OptionPart[]; productIds: string[]; origins: Record<string, string> }> {
  const empty = { parts: [], productIds: [], origins: {} };
  const destination = placeOf(address);
  if (!destination.state) return empty;
  const groups = await bagGroups(store.id, items);
  const supplierGroups = [...groups].filter(([, group]) => group.supplier);
  if (!supplierGroups.length) return empty;
  const supplierSettings = await db.deliverySettings.findMany({ where: { userId: { in: supplierGroups.map(([, group]) => group.supplier!.userId) } } });
  const rules = payerRules(groups);
  const parts: OptionPart[] = [];
  for (const [key, group] of supplierGroups) {
    const own = supplierSettings.find((row) => row.userId === group.supplier!.userId);
    if (!own || !usesOwnZoneRates(own)) continue;
    const shipment: Shipment = {
      key,
      origin: originOf(own, group.supplier!.city),
      sizeBand: parcelBand(group.items, isSizeBand(own.defaultSizeBand) ? own.defaultSizeBand : "small"),
      connections: [],
      selfDelivery: { fee: 0, states: [], zoneRates: own.zoneRates, handlingDays: group.handlingDays },
    };
    const part = selfDeliveryPart(shipment, destination);
    if (part) parts.push(part);
  }
  if (!parts.length) return empty;
  // Who pays: the same rule as with delivery partners; the supplier is still paid the full price.
  const charged = parts.map((part) => {
    const rule = rules[part.shipmentKey];
    const charge = rule ? customerDeliveryCharge(rule.payer, part.price, rule.flatFee) : part.price;
    return charge === part.price ? part : { ...part, charge };
  });
  const productIds = charged.flatMap((part) => groups.get(part.shipmentKey)?.productIds ?? []);
  return { parts: charged, productIds, origins: originNames(groups, supplierSettings) };
}
