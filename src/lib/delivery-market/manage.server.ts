import "server-only";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/notifications/create";
import { SIGN_NAME_ERROR, endDeliveryContracts, signDeliveryAsBusiness } from "@/lib/contracts/contracts.server";
import { cleanSignedName } from "@shared/contracts";
import { invalidatePublicMarketplaceCache } from "@/lib/api/cache";
import {
  ISSUE_KINDS,
  NG_STATES,
  OFFER_SERVICES,
  PARTNER_ISSUES,
  SELL_AREAS,
  canonicalState,
  cardTimeframe,
  cleanAreas,
  cleanServices,
  coverScore,
  isSizeBand,
  partnerMatchesShop,
  partnerStats,
  placeOf,
  rankScore,
  readRateRows,
  startingPrice,
  validateRateCard,
  type IssueKind,
  type PartnerStats,
  type RateCardInput,
} from "@shared/delivery-market";
import { LIVE_PARTNER_WHERE, deliverySettingsFor, originOf } from "./market.server";
import { acceptPrivateRatesProblem, connectionLimitProblem, payOnDeliveryProblem, pickupPointLimitProblem, proposePrivateRatesProblem, sellAreaProblem } from "@/lib/plans/market.server";

// Managing the logistics marketplace: a business's delivery settings ("Where I sell"), its delivery partners
// (connect, choose what customers see, pay on delivery, end), partners' rate cards (public and private), pickup
// points, coverage and business details, finding partners with their stats, and customers' delivery problems.

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const text = (value: unknown, max: number) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max) || null;

// ─── Delivery settings ───────────────────────────────────────────────────────

export interface SettingsInput {
  checkoutMode?: unknown;
  sellArea?: unknown;
  sellStates?: unknown;
  originState?: unknown;
  originArea?: unknown;
  originAddress?: unknown;
  selfPickup?: unknown;
  pickupAddress?: unknown;
  pickupHours?: unknown;
  pickupInstructions?: unknown;
  fallback?: unknown;
  fallbackFee?: unknown;
  defaultSizeBand?: unknown;
  failedFeePayer?: unknown;
  /** Suppliers: "I deliver myself", its fee and the states it drives to. */
  selfDelivery?: unknown;
  selfDeliveryFee?: unknown;
  selfDeliveryStates?: unknown;
}

export async function saveDeliverySettings(userId: string, input: SettingsInput): Promise<Result> {
  const current = await deliverySettingsFor(userId);
  const sellArea = input.sellArea === undefined ? current.sellArea : String(input.sellArea);
  if (!(SELL_AREAS as readonly string[]).includes(sellArea)) return { ok: false, error: "Pick where you sell: one state, selected states or nationwide." };
  const states = input.sellStates === undefined ? current.sellStates : (Array.isArray(input.sellStates) ? input.sellStates : String(input.sellStates ?? "").split(",")).map((state) => canonicalState(String(state))).filter((state): state is (typeof NG_STATES)[number] => !!state);
  const sellStates = [...new Set(states)];
  if (sellArea === "one_state" && sellStates.length !== 1) return { ok: false, error: "Pick the one state you sell in." };
  if (sellArea === "selected" && sellStates.length === 0) return { ok: false, error: "Pick at least one state you sell in." };
  // The plan's selling states (shared/plans.ts sellingStates).
  const areaProblem = await sellAreaProblem(userId, { sellArea, states: sellArea === "nationwide" ? Infinity : sellStates.length }, { sellArea: current.sellArea, states: current.sellArea === "nationwide" ? Infinity : current.sellStates.length });
  if (areaProblem) return { ok: false, error: areaProblem };
  const originState = input.originState === undefined ? current.originState : input.originState ? canonicalState(String(input.originState)) : null;
  if (input.originState && !originState) return { ok: false, error: "Pick the state your parcels leave from." };
  const checkoutMode = input.checkoutMode === undefined ? current.checkoutMode : input.checkoutMode === "partners" ? "partners" : "zones";
  const selfPickup = input.selfPickup === undefined ? current.selfPickup : input.selfPickup === true || input.selfPickup === "on" || input.selfPickup === "true";
  const pickupAddress = input.pickupAddress === undefined ? current.pickupAddress : text(input.pickupAddress, 200);
  if (selfPickup && !pickupAddress) return { ok: false, error: "Add the address where customers pick up their orders." };
  const fallback = input.fallback === undefined ? current.fallback : input.fallback === "flat_fee" ? "flat_fee" : "pickup_only";
  const fee = input.fallbackFee === undefined ? current.fallbackFee : Number(String(input.fallbackFee).replace(/[₦,\s]/g, ""));
  if (fallback === "flat_fee" && !(Number.isFinite(fee) && fee > 0)) return { ok: false, error: "Type the flat delivery fee for places your partners don't cover." };
  const selfDelivery = input.selfDelivery === undefined ? current.selfDelivery : input.selfDelivery === true || input.selfDelivery === "on" || input.selfDelivery === "true";
  const selfFee = input.selfDeliveryFee === undefined ? current.selfDeliveryFee : Number(String(input.selfDeliveryFee).replace(/[₦,\s]/g, ""));
  if (selfDelivery && !(Number.isFinite(selfFee) && selfFee > 0 && selfFee <= 1_000_000)) return { ok: false, error: "Type what you charge to deliver an order yourself." };
  const selfStates = input.selfDeliveryStates === undefined
    ? current.selfDeliveryStates
    : [...new Set((Array.isArray(input.selfDeliveryStates) ? input.selfDeliveryStates : String(input.selfDeliveryStates ?? "").split(",")).map((state) => canonicalState(String(state))).filter((state): state is (typeof NG_STATES)[number] => !!state))];
  const defaultSizeBand = input.defaultSizeBand === undefined ? current.defaultSizeBand : String(input.defaultSizeBand);
  if (!isSizeBand(defaultSizeBand)) return { ok: false, error: "Pick the usual size of your parcels." };
  const data = {
    checkoutMode,
    sellArea,
    sellStates: sellArea === "nationwide" ? [] : sellStates,
    originState,
    originArea: input.originArea === undefined ? current.originArea : text(input.originArea, 80),
    originAddress: input.originAddress === undefined ? current.originAddress : text(input.originAddress, 200),
    selfPickup,
    pickupAddress,
    pickupHours: input.pickupHours === undefined ? current.pickupHours : text(input.pickupHours, 120),
    pickupInstructions: input.pickupInstructions === undefined ? current.pickupInstructions : text(input.pickupInstructions, 300),
    fallback,
    fallbackFee: fallback === "flat_fee" ? Math.round(fee * 100) / 100 : 0,
    defaultSizeBand,
    failedFeePayer: input.failedFeePayer === undefined ? current.failedFeePayer : input.failedFeePayer === "customer" ? "customer" : "seller",
    selfDelivery,
    selfDeliveryFee: selfDelivery ? Math.round(selfFee * 100) / 100 : current.selfDeliveryFee,
    selfDeliveryStates: selfStates,
  };
  await db.deliverySettings.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return { ok: true };
}

// ─── Connections ("My delivery partners") ────────────────────────────────────

/**
 * Connecting signs the Delivery service agreement for the business (shared/contracts.ts): `typedName` when the
 * screen asks for one, else the account name (connecting from a list or during setup). The partner signs their
 * copy under Contracts; jobs can start on the public rates meanwhile.
 */
export async function connectPartner(owner: { id: string; role: string; name?: string | null }, partnerId: string, typedName?: string): Promise<Result<{ connectionId: string }>> {
  if (owner.role !== "seller" && owner.role !== "supplier") return { ok: false, error: "Only sellers and suppliers connect delivery partners." };
  if (typedName !== undefined && !cleanSignedName(typedName)) return { ok: false, error: SIGN_NAME_ERROR };
  const partner = await db.logisticsPartner.findFirst({ where: { id: partnerId, ...LIVE_PARTNER_WHERE }, select: { id: true, userId: true, displayName: true } });
  if (!partner) return { ok: false, error: "This delivery partner isn't available right now." };
  const limitProblem = await connectionLimitProblem(owner.id, partner.id);
  if (limitProblem) return { ok: false, error: limitProblem };
  // Connecting is instant on the partner's public rates (decision 1); the partner can end it.
  const connection = await db.deliveryConnection.upsert({
    where: { ownerUserId_logisticsPartnerId: { ownerUserId: owner.id, logisticsPartnerId: partner.id } },
    update: { status: "active", endedAt: null, endedBy: null },
    create: { ownerUserId: owner.id, ownerRole: owner.role, logisticsPartnerId: partner.id },
  });
  const signed = await db.contract.count({ where: { deliveryConnectionId: connection.id, status: { in: ["awaiting", "signed"] } } });
  if (!signed) {
    const contract = await signDeliveryAsBusiness({ connectionId: connection.id, owner, partnerId: partner.id, signer: { userId: owner.id, typedName, accountName: owner.name } }).catch((error) => {
      console.error("[delivery contract] could not sign", error);
      return null;
    });
    if (contract && !contract.ok) return { ok: false, error: contract.error };
  }
  void import("@/lib/rewards/rewards.server").then((rewards) => rewards.recordRewardEvent({ userId: owner.id, kind: "partner_connected", ref: partner.id })).catch(() => undefined);
  const who = owner.role === "supplier"
    ? (await db.supplier.findUnique({ where: { userId: owner.id }, select: { displayName: true } }))?.displayName
    : (await db.store.findUnique({ where: { userId: owner.id }, select: { name: true } }))?.name;
  await createNotification({
    userId: partner.userId,
    type: "logistics",
    priority: "info",
    title: `${who ?? "A business"} added you as a delivery partner`,
    description: "Their orders to the areas you cover can now come to you as jobs, at your public rates.",
    link: "/logistics/connections",
    event: "delivery.update",
    dedupeKey: `delivery.connected:${connection.id}:${connection.updatedAt.getTime()}`,
  }).catch(() => null);
  return { ok: true, data: { connectionId: connection.id } };
}

export interface ConnectionUpdate {
  services?: unknown;
  showPartnerName?: unknown;
  label?: unknown;
  ownerPod?: unknown;
  acceptPodDisclaimer?: unknown;
}

export async function updateConnection(ownerId: string, connectionId: string, input: ConnectionUpdate): Promise<Result> {
  const connection = await db.deliveryConnection.findFirst({ where: { id: connectionId, ownerUserId: ownerId, status: "active" } });
  if (!connection) return { ok: false, error: "We couldn't find that delivery partner." };
  const data: Record<string, unknown> = {};
  if (input.services !== undefined) {
    const services = cleanServices(input.services).filter((service) => (OFFER_SERVICES as readonly string[]).includes(service));
    if (!services.length) return { ok: false, error: "Offer customers at least one service for this partner, or remove the partner." };
    data.services = services;
  }
  if (input.showPartnerName !== undefined) data.showPartnerName = input.showPartnerName === true || input.showPartnerName === "on" || input.showPartnerName === "true";
  if (input.label !== undefined) data.label = text(input.label, 40);
  if (input.ownerPod !== undefined) {
    const on = input.ownerPod === true || input.ownerPod === "on" || input.ownerPod === "true";
    if (on && !connection.ownerPod) {
      const podProblem = await payOnDeliveryProblem(ownerId);
      if (podProblem) return { ok: false, error: podProblem };
    }
    if (on && !connection.podAcceptedAt && !(input.acceptPodDisclaimer === true || input.acceptPodDisclaimer === "on" || input.acceptPodDisclaimer === "true")) {
      return { ok: false, error: "Read and accept the pay-on-delivery note to switch it on." };
    }
    data.ownerPod = on;
    if (on && !connection.podAcceptedAt) data.podAcceptedAt = new Date();
  }
  await db.deliveryConnection.update({ where: { id: connection.id }, data });
  return { ok: true };
}

/** Ends a connection (the business or the partner). Jobs already sent carry on to the end. */
export async function endConnection(actor: { userId: string; side: "owner" | "partner"; partnerId?: string }, connectionId: string): Promise<Result> {
  const where = actor.side === "owner" ? { id: connectionId, ownerUserId: actor.userId } : { id: connectionId, logisticsPartnerId: actor.partnerId ?? "" };
  const moved = await db.deliveryConnection.updateMany({ where: { ...where, status: "active" }, data: { status: "ended", endedAt: new Date(), endedBy: actor.side } });
  if (moved.count === 1) await endDeliveryContracts(connectionId, actor.side === "owner" ? "a" : "b").catch(() => null);
  return moved.count === 1 ? { ok: true } : { ok: false, error: "That connection has already ended." };
}

/** The partner's side of pay on delivery for one connection. */
export async function partnerSetPod(partnerId: string, connectionId: string, on: boolean): Promise<Result> {
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { offersPayOnDelivery: true } });
  if (on && !partner?.offersPayOnDelivery) return { ok: false, error: "Switch on pay on delivery in your services first." };
  const moved = await db.deliveryConnection.updateMany({ where: { id: connectionId, logisticsPartnerId: partnerId, status: "active" }, data: { partnerPod: on } });
  return moved.count === 1 ? { ok: true } : { ok: false, error: "We couldn't find that connection." };
}

export async function connectionsForOwner(ownerId: string) {
  return db.deliveryConnection.findMany({
    where: { ownerUserId: ownerId, status: "active" },
    orderBy: { createdAt: "asc" },
    include: { logisticsPartner: { select: { id: true, slug: true, displayName: true, logoUrl: true, status: true, verificationStatus: true, services: true, offersPayOnDelivery: true, userId: true, badges: true } } },
  });
}

export async function connectionsForPartner(partnerId: string) {
  const rows = await db.deliveryConnection.findMany({
    where: { logisticsPartnerId: partnerId, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { id: true, name: true, role: true, store: { select: { name: true, slug: true } }, supplier: { select: { displayName: true } } } } },
  });
  const cards = await db.logisticsRateCard.findMany({ where: { logisticsPartnerId: partnerId, ownerUserId: { in: rows.map((row) => row.ownerUserId) }, status: { in: ["proposed", "accepted"] } }, select: { id: true, ownerUserId: true, status: true, createdAt: true } });
  return rows.map((row) => ({ ...row, businessName: row.owner.store?.name ?? row.owner.supplier?.displayName ?? row.owner.name, privateCards: cards.filter((card) => card.ownerUserId === row.ownerUserId) }));
}

// ─── Rate cards ──────────────────────────────────────────────────────────────

/** Publishes a new public rate card. The old one is kept as retired; orders already placed keep the price they got. */
export async function savePublicRateCard(partnerId: string, input: RateCardInput): Promise<Result> {
  const checked = validateRateCard(input);
  if (!checked.ok) return checked;
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { slug: true } });
  await db.$transaction([
    db.logisticsRateCard.updateMany({ where: { logisticsPartnerId: partnerId, ownerUserId: null, status: "active" }, data: { status: "retired" } }),
    db.logisticsRateCard.create({ data: { logisticsPartnerId: partnerId, ownerUserId: null, status: "active", rows: JSON.parse(JSON.stringify(checked.card.rows)), failedAttemptFee: checked.card.failedAttemptFee, returnFee: checked.card.returnFee, notes: checked.card.notes } }),
    // The "from" price sellers see in the directory follows the card.
    db.logisticsPartner.update({ where: { id: partnerId }, data: { basePrice: startingPrice(checked.card.rows) ?? 0, estimatedSpeed: cardTimeframe(checked.card.rows) } }),
  ]);
  invalidatePublicMarketplaceCache({ logisticsSlug: partner?.slug });
  return { ok: true };
}

/** A private card for one connected business (e.g. after agreeing a price in chat). Used once they accept it. */
export async function proposePrivateRateCard(partnerId: string, ownerUserId: string, input: RateCardInput): Promise<Result> {
  const connection = await db.deliveryConnection.findFirst({ where: { logisticsPartnerId: partnerId, ownerUserId, status: "active" }, select: { id: true } });
  if (!connection) return { ok: false, error: "You can send private rates to businesses that have added you as a delivery partner." };
  const partnerUser = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { userId: true } });
  const planProblem = partnerUser ? await proposePrivateRatesProblem(partnerUser.userId) : null;
  if (planProblem) return { ok: false, error: planProblem };
  const checked = validateRateCard(input);
  if (!checked.ok) return checked;
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { displayName: true } });
  await db.$transaction([
    db.logisticsRateCard.updateMany({ where: { logisticsPartnerId: partnerId, ownerUserId, status: "proposed" }, data: { status: "withdrawn" } }),
    db.logisticsRateCard.create({ data: { logisticsPartnerId: partnerId, ownerUserId, status: "proposed", rows: JSON.parse(JSON.stringify(checked.card.rows)), failedAttemptFee: checked.card.failedAttemptFee, returnFee: checked.card.returnFee, notes: checked.card.notes } }),
  ]);
  const owner = await db.user.findUnique({ where: { id: ownerUserId }, select: { role: true } });
  await createNotification({
    userId: ownerUserId,
    type: "logistics",
    priority: "info",
    title: `${partner?.displayName ?? "A delivery partner"} sent you private rates`,
    description: "Accept them to use these prices for your deliveries with them.",
    link: owner?.role === "supplier" ? "/supplier/delivery" : "/home/logistics/partners",
    event: "delivery.update",
  }).catch(() => null);
  return { ok: true };
}

export async function respondToPrivateRateCard(ownerUserId: string, cardId: string, accept: boolean): Promise<Result> {
  const card = await db.logisticsRateCard.findFirst({ where: { id: cardId, ownerUserId, status: "proposed" }, select: { id: true, logisticsPartnerId: true, logisticsPartner: { select: { userId: true } } } });
  if (!card) return { ok: false, error: "These rates are no longer waiting for you." };
  if (accept) {
    const planProblem = await acceptPrivateRatesProblem(ownerUserId);
    if (planProblem) return { ok: false, error: planProblem };
  }
  const now = new Date();
  await db.$transaction([
    ...(accept ? [db.logisticsRateCard.updateMany({ where: { logisticsPartnerId: card.logisticsPartnerId, ownerUserId, status: "accepted" }, data: { status: "retired" } })] : []),
    db.logisticsRateCard.update({ where: { id: card.id }, data: { status: accept ? "accepted" : "declined", respondedAt: now } }),
  ]);
  await createNotification({
    userId: card.logisticsPartner.userId,
    type: "logistics",
    priority: accept ? "success" : "info",
    title: accept ? "Your private rates were accepted" : "Your private rates were declined",
    description: accept ? "New orders from this business use your private rates." : "Their orders keep using your public rates. You can send new rates.",
    link: "/logistics/connections",
    event: "delivery.update",
  }).catch(() => null);
  return { ok: true };
}

export async function withdrawPrivateRateCard(partnerId: string, cardId: string): Promise<Result> {
  const moved = await db.logisticsRateCard.updateMany({ where: { id: cardId, logisticsPartnerId: partnerId, status: { in: ["proposed", "accepted"] }, ownerUserId: { not: null } }, data: { status: "withdrawn" } });
  return moved.count === 1 ? { ok: true } : { ok: false, error: "Those rates aren't active." };
}

export async function rateCardsForPartner(partnerId: string) {
  const [publicCard, history] = await Promise.all([
    db.logisticsRateCard.findFirst({ where: { logisticsPartnerId: partnerId, ownerUserId: null, status: "active" }, orderBy: { createdAt: "desc" } }),
    db.logisticsRateCard.count({ where: { logisticsPartnerId: partnerId, ownerUserId: null, status: "retired" } }),
  ]);
  return { publicCard: publicCard ? { ...publicCard, rows: readRateRows(publicCard.rows) } : null, retiredCount: history };
}

/** Private cards waiting for (or accepted by) a business, with the partner. */
export async function privateCardsForOwner(ownerUserId: string) {
  const cards = await db.logisticsRateCard.findMany({
    where: { ownerUserId, status: { in: ["proposed", "accepted"] } },
    orderBy: { createdAt: "desc" },
    include: { logisticsPartner: { select: { id: true, displayName: true, slug: true } } },
  });
  return cards.map((card) => ({ ...card, rows: readRateRows(card.rows) }));
}

// ─── Coverage, services and business details ─────────────────────────────────

export interface CoverageInput {
  services?: unknown;
  pickupAreas?: unknown;
  deliveryAreas?: unknown;
  offersPayOnDelivery?: unknown;
}

export async function savePartnerCoverage(partnerId: string, input: CoverageInput): Promise<Result<{ unknown: string[] }>> {
  const services = cleanServices(input.services);
  if (!services.includes("doorstep") && !services.includes("pickup_point")) return { ok: false, error: "Offer doorstep delivery, pickup points, or both." };
  const pickup = cleanAreas(input.pickupAreas);
  const delivery = cleanAreas(input.deliveryAreas);
  if (!pickup.areas.length) return { ok: false, error: "Add at least one place you pick up from (a state, region or Nationwide)." };
  if (!delivery.areas.length) return { ok: false, error: "Add at least one place you deliver to (a state, region or Nationwide)." };
  const partner = await db.logisticsPartner.update({
    where: { id: partnerId },
    data: {
      services,
      pickupAreas: pickup.areas,
      deliveryAreas: delivery.areas,
      offersPayOnDelivery: input.offersPayOnDelivery === true || input.offersPayOnDelivery === "on" || input.offersPayOnDelivery === "true",
    },
    select: { slug: true, offersPayOnDelivery: true },
  });
  // Pay on delivery switched off: every connection stops offering it at once.
  if (!partner.offersPayOnDelivery) await db.deliveryConnection.updateMany({ where: { logisticsPartnerId: partnerId, partnerPod: true }, data: { partnerPod: false } });
  invalidatePublicMarketplaceCache({ logisticsSlug: partner.slug });
  return { ok: true, data: { unknown: [...pickup.unknown, ...delivery.unknown] } };
}

export async function savePartnerBusiness(partnerId: string, input: { companyName?: unknown; cacNumber?: unknown; contactName?: unknown; contactPhone?: unknown; contactEmail?: unknown; address?: unknown }): Promise<Result> {
  const email = text(input.contactEmail, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Check the contact email." };
  const phone = text(input.contactPhone, 40);
  if (phone && phone.replace(/\D/g, "").length < 7) return { ok: false, error: "Check the contact phone number." };
  const cac = text(input.cacNumber, 20)?.toUpperCase().replace(/\s+/g, "") ?? null;
  if (cac && !/^(RC|BN|IT|LP|LLP)?\d{3,9}$/.test(cac)) return { ok: false, error: "Type the CAC number as it appears on your certificate, e.g. RC123456 or BN1234567." };
  const companyName = text(input.companyName, 120);
  await db.logisticsPartner.update({
    where: { id: partnerId },
    data: { ...(companyName ? { companyName } : {}), cacNumber: cac, contactName: text(input.contactName, 80), contactPhone: phone, contactEmail: email, address: text(input.address, 200) },
  });
  return { ok: true };
}

// ─── Pickup points ───────────────────────────────────────────────────────────

export interface PickupPointInput {
  name?: unknown;
  address?: unknown;
  state?: unknown;
  area?: unknown;
  hours?: unknown;
  phone?: unknown;
  lat?: unknown;
  lng?: unknown;
}

export async function savePickupPoint(partnerId: string, pointId: string | null, input: PickupPointInput): Promise<Result> {
  const name = text(input.name, 80);
  const address = text(input.address, 200);
  const state = canonicalState(String(input.state ?? ""));
  if (!name) return { ok: false, error: "Name the pickup point, e.g. \"Yaba hub\"." };
  if (!address) return { ok: false, error: "Add the pickup point's address." };
  if (!state) return { ok: false, error: "Pick the state the pickup point is in." };
  const lat = input.lat === undefined || input.lat === "" ? null : Number(input.lat);
  const lng = input.lng === undefined || input.lng === "" ? null : Number(input.lng);
  const pin = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : { lat: null, lng: null };
  const data = { name, address, state, area: text(input.area, 80), hours: text(input.hours, 120), phone: text(input.phone, 40), ...pin };
  if (pointId) {
    const moved = await db.logisticsPickupPoint.updateMany({ where: { id: pointId, logisticsPartnerId: partnerId }, data });
    if (moved.count !== 1) return { ok: false, error: "We couldn't find that pickup point." };
  } else {
    if ((await db.logisticsPickupPoint.count({ where: { logisticsPartnerId: partnerId, active: true } })) >= 200) return { ok: false, error: "You can have up to 200 pickup points." };
    const planProblem = await pickupPointLimitProblem(partnerId);
    if (planProblem) return { ok: false, error: planProblem };
    await db.logisticsPickupPoint.create({ data: { logisticsPartnerId: partnerId, ...data } });
  }
  await refreshPartnerListing(partnerId);
  return { ok: true };
}

/** The website's partner listing shows pickup points: drop its cached copy. */
async function refreshPartnerListing(partnerId: string) {
  const partner = await db.logisticsPartner.findUnique({ where: { id: partnerId }, select: { slug: true } });
  invalidatePublicMarketplaceCache({ logisticsSlug: partner?.slug });
}

export async function removePickupPoint(partnerId: string, pointId: string): Promise<Result> {
  const moved = await db.logisticsPickupPoint.updateMany({ where: { id: pointId, logisticsPartnerId: partnerId, active: true }, data: { active: false } });
  if (moved.count !== 1) return { ok: false, error: "That pickup point is already removed." };
  await refreshPartnerListing(partnerId);
  return { ok: true };
}

// ─── Stats and finding partners ──────────────────────────────────────────────

/** In-app delivery stats per partner (completed, on-time %, failed %). Only marketplace and booked jobs count. */
export async function statsForPartners(partnerIds: string[]): Promise<Map<string, PartnerStats>> {
  const out = new Map<string, PartnerStats>();
  if (!partnerIds.length) return out;
  const since = new Date(Date.now() - 365 * 86_400_000);
  const jobs = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: { in: partnerIds }, createdAt: { gte: since }, status: { in: ["delivered", "failed", "returning", "returned"] } },
    select: { logisticsPartnerId: true, status: true, deliveredAt: true, estimatedDelivery: true, failedAttempts: true },
    take: 20_000,
  });
  for (const id of partnerIds) out.set(id, partnerStats(jobs.filter((job) => job.logisticsPartnerId === id)));
  return out;
}

export interface FindFilters {
  service?: string | null;
  state?: string | null;
  maxPrice?: number | null;
  minRating?: number | null;
  pickupPoints?: boolean;
  q?: string | null;
  /** shared/partner-tiers.ts PARTNER_BADGES. */
  badge?: string | null;
}

/** "Find partners" (spec §5.2): partners serving where the business sells from where it ships, best first. */
export async function findPartners(owner: { id: string; role: string }, filters: FindFilters = {}) {
  const [settings, profile, connected] = await Promise.all([
    deliverySettingsFor(owner.id),
    owner.role === "supplier" ? db.supplier.findUnique({ where: { userId: owner.id }, select: { city: true } }) : db.store.findUnique({ where: { userId: owner.id }, select: { city: true } }),
    db.deliveryConnection.findMany({ where: { ownerUserId: owner.id, status: "active" }, select: { logisticsPartnerId: true, id: true } }),
  ]);
  const origin = originOf(settings, profile?.city ?? null);
  const q = filters.q?.trim();
  const partners = await db.logisticsPartner.findMany({
    where: {
      ...LIVE_PARTNER_WHERE,
      ...(q ? { OR: [{ displayName: { contains: q, mode: "insensitive" as const } }, { companyName: { contains: q, mode: "insensitive" as const } }] } : {}),
      ...(filters.service ? { services: { has: filters.service } } : {}),
      ...(filters.minRating ? { rating: { gte: filters.minRating } } : {}),
      ...(filters.badge ? { badges: { has: filters.badge } } : {}),
    },
    select: {
      id: true, slug: true, displayName: true, logoUrl: true, rating: true, ratingCount: true, verificationStatus: true, services: true, pickupAreas: true, deliveryAreas: true, offersPayOnDelivery: true, badges: true, vehicleTypes: true,
      rateCards: { where: { ownerUserId: null, status: "active" }, take: 1, orderBy: { createdAt: "desc" }, select: { rows: true } },
      _count: { select: { pickupPoints: { where: { active: true } } } },
    },
    take: 300,
  });
  const stats = await statsForPartners(partners.map((partner) => partner.id));
  const state = filters.state ? canonicalState(filters.state) : null;
  const rows = partners
    .map((partner) => {
      const rows = readRateRows(partner.rateCards[0]?.rows);
      const from = startingPrice(rows);
      const stat = stats.get(partner.id) ?? { completed: 0, onTimeRate: null, failedRate: null };
      const target = state ? [state] : settings.sellArea === "nationwide" ? [] : settings.sellStates;
      const match = Math.max(0, coverScore(partner.pickupAreas, origin)) + (target.length ? Math.max(...target.map((name) => coverScore(partner.deliveryAreas, placeOf({ state: name })))) : 1);
      return {
        partner,
        startingPrice: from,
        timeframe: cardTimeframe(rows),
        stats: stat,
        pickupPointCount: partner._count.pickupPoints,
        connectionId: connected.find((entry) => entry.logisticsPartnerId === partner.id)?.id ?? null,
        matchesShop: partnerMatchesShop(partner, { origin: origin.state ? origin : null, sellArea: state ? "selected" : settings.sellArea, sellStates: state ? [state] : settings.sellStates }),
        score: rankScore({ stats: stat, rating: partner.rating, ratingCount: partner.ratingCount, match, verified: partner.verificationStatus === "verified", registered: partner.badges.includes("registered_business") }),
      };
    })
    .filter((row) => row.matchesShop && row.startingPrice !== null)
    .filter((row) => !filters.maxPrice || (row.startingPrice ?? Infinity) <= filters.maxPrice)
    .filter((row) => !filters.pickupPoints || row.pickupPointCount > 0)
    .sort((a, b) => b.score - a.score);
  return { origin, settings, rows };
}

/** Everything a seller or supplier sees on a partner's page (spec §5.3). */
export async function partnerDetail(slug: string, viewerId: string | null) {
  const partner = await db.logisticsPartner.findFirst({
    where: { slug, ...LIVE_PARTNER_WHERE },
    select: {
      id: true, slug: true, userId: true, displayName: true, companyName: true, description: true, logoUrl: true, bannerUrl: true, rating: true, ratingCount: true, verificationStatus: true,
      services: true, pickupAreas: true, deliveryAreas: true, offersPayOnDelivery: true, cacNumber: true, city: true, badges: true, vehicleTypes: true,
      rateCards: { where: { ownerUserId: null, status: "active" }, take: 1, orderBy: { createdAt: "desc" } },
      pickupPoints: { where: { active: true }, orderBy: [{ state: "asc" }, { name: "asc" }] },
      reviews: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, rating: true, comment: true, response: true, createdAt: true, reviewer: { select: { name: true } } } },
    },
  });
  if (!partner) return null;
  const [stats, connection, privateCard] = await Promise.all([
    statsForPartners([partner.id]).then((map) => map.get(partner.id)!),
    viewerId ? db.deliveryConnection.findUnique({ where: { ownerUserId_logisticsPartnerId: { ownerUserId: viewerId, logisticsPartnerId: partner.id } } }) : null,
    viewerId ? db.logisticsRateCard.findFirst({ where: { logisticsPartnerId: partner.id, ownerUserId: viewerId, status: { in: ["proposed", "accepted"] } }, orderBy: { createdAt: "desc" } }) : null,
  ]);
  const card = partner.rateCards[0] ?? null;
  return {
    partner,
    card: card ? { ...card, rows: readRateRows(card.rows) } : null,
    privateCard: privateCard ? { ...privateCard, rows: readRateRows(privateCard.rows) } : null,
    stats,
    connection: connection?.status === "active" ? connection : null,
  };
}

// ─── Delivery problems (spec §6.4) ───────────────────────────────────────────

export async function reportDeliveryIssue(input: { orderId: string; storeId: string; kind: string; message?: unknown; reporterName?: unknown }): Promise<Result> {
  if (!(ISSUE_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: "Pick what went wrong." };
  const kind = input.kind as IssueKind;
  const order = await db.retailOrder.findFirst({ where: { id: input.orderId, storeId: input.storeId }, select: { id: true, orderNumber: true, store: { select: { userId: true } } } });
  if (!order) return { ok: false, error: "We couldn't find this order." };
  const recent = await db.deliveryIssue.count({ where: { retailOrderId: order.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
  if (recent >= 5) return { ok: false, error: "You've already told the seller about this order today. They'll be in touch." };
  const job = await db.deliveryBooking.findFirst({ where: { orderId: order.id, status: { notIn: ["cancelled", "declined"] } }, orderBy: { createdAt: "desc" }, select: { id: true, logisticsPartnerId: true, logisticsPartner: { select: { userId: true } } } });
  const toPartner = !!job && PARTNER_ISSUES.includes(kind);
  const issue = await db.deliveryIssue.create({
    data: { retailOrderId: order.id, storeId: input.storeId, bookingId: job?.id ?? null, logisticsPartnerId: toPartner ? job!.logisticsPartnerId : null, kind, message: text(input.message, 1000), reporterName: text(input.reporterName, 80) },
  });
  const words = { late: "is late", not_delivered: "wasn't delivered", damaged: "arrived damaged", wrong_item: "had the wrong item" }[kind];
  await createNotification({ userId: order.store.userId, type: "logistics", priority: "critical", title: `Customer says order ${order.orderNumber} ${words}`, description: issue.message ?? "Contact your customer to sort it out.", link: `/home/orders/${order.id}`, event: "delivery.update", dedupeKey: `delivery.issue:${issue.id}` }).catch(() => null);
  if (toPartner) {
    await createNotification({ userId: job!.logisticsPartner.userId, type: "logistics", priority: "warning", title: `A customer reported a problem: order ${order.orderNumber} ${words}`, description: issue.message ?? "Check the job and contact the shop.", link: "/logistics/bookings", event: "delivery.update", dedupeKey: `delivery.issue.partner:${issue.id}` }).catch(() => null);
  }
  return { ok: true };
}

export async function resolveDeliveryIssue(storeId: string, issueId: string): Promise<Result> {
  const moved = await db.deliveryIssue.updateMany({ where: { id: issueId, storeId, status: "open" }, data: { status: "resolved", resolvedAt: new Date() } });
  return moved.count === 1 ? { ok: true } : { ok: false, error: "That problem is already resolved." };
}
