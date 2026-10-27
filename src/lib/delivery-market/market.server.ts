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
  type CheckoutSettingsInput,
  type MarketChoice,
  type MarketConnection,
  type Place,
  type Shipment,
  type SizeBand,
} from "@shared/delivery-market";

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
        offersPayOnDelivery: partner.offersPayOnDelivery,
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

/**
 * The delivery options for a bag at a store, or null when the store prices delivery with its own zones (the seller
 * hasn't switched checkout to delivery partners). Dropship items ship from their supplier with the supplier's
 * partners (decision 2); a supplier with no partners yet falls back to the shop's partners collecting from the supplier.
 */
export async function marketChoiceForStore(
  store: { id: string; userId: string; city: string | null },
  items: MarketBagItem[],
  address: { city?: string | null; state?: string | null },
  /** The bag's value in naira: Tier 1 partners take orders up to their limit (shared/partner-tiers.ts). */
  orderValue?: number,
): Promise<{ choice: MarketChoice; shipments: Shipment[] } | null> {
  const settings = await deliverySettingsFor(store.userId);
  if (settings.checkoutMode !== "partners") return null;
  const fallbackBand: SizeBand = isSizeBand(settings.defaultSizeBand) ? settings.defaultSizeBand : "small";

  const products = await db.storeProduct.findMany({
    where: { storeId: store.id, id: { in: [...new Set(items.map((item) => item.productId))] } },
    select: {
      id: true, sizeBand: true, weight: true, weightUnit: true, fulfillmentType: true,
      supplierProduct: { select: { supplier: { select: { id: true, userId: true, city: true } } } },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const groups = new Map<string, { items: Array<{ sizeBand: string | null; weight: number | null; weightUnit: string; quantity: number }>; supplier: { id: string; userId: string; city: string } | null }>();
  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) continue;
    const supplier = product.fulfillmentType === "dropship" ? product.supplierProduct?.supplier ?? null : null;
    const key = supplier ? `supplier:${supplier.id}` : "own";
    const group = groups.get(key) ?? { items: [], supplier };
    group.items.push({ sizeBand: product.sizeBand, weight: product.weight, weightUnit: product.weightUnit, quantity: item.quantity });
    groups.set(key, group);
  }
  if (!groups.size) groups.set("own", { items: [], supplier: null });

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
    return {
      key,
      origin: originOf(own ?? DEFAULT_SETTINGS, group.supplier.city),
      sizeBand: parcelBand(group.items, own && isSizeBand(own.defaultSizeBand) ? own.defaultSizeBand : fallbackBand),
      connections: theirs.length ? theirs : shopConnections,
      selfDelivery: own?.selfDelivery ? { fee: own.selfDeliveryFee, states: own.selfDeliveryStates } : null,
    };
  });

  const choice = buildMarketChoice({ settings: checkoutSettingsOf(settings), shipments, destination: placeOf(address) });
  return { choice, shipments };
}
