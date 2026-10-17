import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { appOrigin } from "@/lib/ads";
import { billingEmail } from "@/lib/auth/billing-email";
import { createNotification } from "@/lib/notifications/create";
import { initializePaystackTransaction, refundPaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { NetworkDeliveryRequestSchema } from "@/lib/schemas";
import { orderCollectAmount } from "./booking.server";
import { carrierFor, listCarriers } from "./carriers";
import { canStoreNetworkAccounts, networkCredentials, sealCredentials } from "./carriers/accounts.server";
import { networkTotal } from "./carriers/fee";
import { cancelCarrierBooking, carrierJobInput, createCarrierBooking } from "./carriers/jobs.server";
import type { Carrier, CarrierCredentials, CarrierErrorCode, CarrierJobInput } from "./carriers/types";

// Delivery networks: Kwik, Fez, Sendstack, Sendbox… embedded through their own API, apart from the logistics
// partners who sign up and work jobs in the partner portal. The price is always the network's own; Shopinbos never
// sets it.
//
// Two ways to book a network:
//   * On the seller's own network account (connected in Delivery › Delivery networks): booked at once and paid to
//     the network directly. No Shopinbos fee.
//   * On Shopinbos's network account: the seller pays the network's price plus a small Shopinbos fee
//     (carriers/fee.ts) with Paystack first. Once the payment is verified (callback or webhook, whichever is first)
//     the job is booked with the network, or, if that fails, the payment is refunded.
//
// Each network has a hidden LogisticsPartner row (carrier = its id) that its bookings hang off; partner listings
// leave those rows out (carrier: null). The admin switches a network on or off at /admin/delivery-networks.

export const NETWORK_REFERENCE_PREFIX = "netdelivery-";

export type NetworkRequest = z.infer<typeof NetworkDeliveryRequestSchema>;

export class NetworkError extends Error {
  constructor(public code: CarrierErrorCode | "NOT_FOUND" | "BAD_REQUEST", message: string) {
    super(message);
  }
}

/** A NetworkError as an API error response, anything else as a 500. */
export function networkApiError(error: unknown) {
  if (!(error instanceof NetworkError)) {
    console.error("[delivery networks]", error);
    return apiError("INTERNAL_ERROR", "Something went wrong. Try again in a minute.", 500);
  }
  const status: Record<string, number> = { NOT_FOUND: 404, BAD_REQUEST: 400, BAD_ADDRESS: 400, PRICE_CHANGED: 409, REJECTED: 422, UNAVAILABLE: 503, NOT_CONFIGURED: 503 };
  return apiError(error.code, error.message, status[error.code] ?? 400);
}

// ─── Admin: which networks are on ─────────────────────────────────────────────

/**
 * Paid checkouts whose money still has to go back by hand: Paystack refused the refund, or the booking failed and
 * no refund was started.
 */
export function refundsToCheck() {
  return db.deliveryNetworkCheckout.findMany({
    where: { paidAt: { not: null }, OR: [{ refundStatus: "failed" }, { status: "failed", refundStatus: null }] },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, network: true, sellerId: true, total: true, paymentRef: true, error: true, createdAt: true },
  });
}

/** Every network we can book, whether Shopinbos's account is set up, and whether it's switched on. */
export async function adminNetworks() {
  const partners = await db.logisticsPartner.findMany({ where: { carrier: { not: null } }, select: { id: true, carrier: true, status: true } });
  const ids = partners.map((p) => p.id);
  const [bookings, checkouts] = await Promise.all([
    ids.length ? db.deliveryBooking.groupBy({ by: ["logisticsPartnerId"], where: { logisticsPartnerId: { in: ids } }, _count: { _all: true } }) : [],
    db.deliveryNetworkCheckout.groupBy({ by: ["network", "status"], _count: { _all: true }, _sum: { fee: true } }),
  ]);
  const accounts = await db.deliveryNetworkAccount.groupBy({ by: ["network"], _count: { _all: true } });
  return listCarriers().map((carrier) => {
    const partner = partners.find((p) => p.carrier === carrier.id);
    const booked = checkouts.filter((c) => c.network === carrier.id && c.status === "booked");
    return {
      id: carrier.id,
      name: carrier.name,
      configured: carrier.configured(),
      enabled: partner?.status === "active",
      bookings: bookings.find((b) => b.logisticsPartnerId === partner?.id)?._count._all ?? 0,
      paidBookings: booked.reduce((n, c) => n + c._count._all, 0),
      feesEarned: booked.reduce((n, c) => n + (c._sum.fee ?? 0), 0),
      sellerAccounts: accounts.find((a) => a.network === carrier.id)?._count._all ?? 0,
    };
  });
}

/** Switches a network on (creating its hidden partner row the first time) or off. */
export async function setNetworkEnabled(id: string, enabled: boolean) {
  const carrier = carrierFor({ carrier: id });
  if (!carrier) throw new NetworkError("NOT_FOUND", "Unknown delivery network.");
  const existing = await db.logisticsPartner.findFirst({ where: { carrier: carrier.id }, select: { id: true } });
  if (existing) {
    await db.logisticsPartner.update({ where: { id: existing.id }, data: { status: enabled ? "active" : "paused" } });
    return;
  }
  if (!enabled) return;
  // Bookings need a partner row, and a partner row needs a user: a system user nobody can sign in as.
  const user = await db.user.upsert({
    where: { supabaseId: `carrier:${carrier.id}` },
    create: { id: `carrier_${carrier.id}_user`, supabaseId: `carrier:${carrier.id}`, name: carrier.name, role: "logistics_partner", country: "Nigeria", verificationStatus: "verified" },
    update: {},
    select: { id: true },
  });
  await db.logisticsPartner.create({
    data: {
      id: `carrier_${carrier.id}`,
      userId: user.id,
      companyName: carrier.name,
      slug: `network-${carrier.id}`,
      displayName: carrier.name,
      country: "Nigeria",
      city: "Lagos",
      pricingModel: "network",
      verificationStatus: "verified",
      status: "active",
      carrier: carrier.id,
    },
  });
}

// ─── Seller: networks, accounts, prices ───────────────────────────────────────

/** The networks a seller can book: switched on, and either Shopinbos's account is set up or they connected theirs. */
export async function sellerNetworks(userId: string) {
  const [partners, accounts] = await Promise.all([
    db.logisticsPartner.findMany({ where: { carrier: { not: null }, status: "active" }, select: { id: true, carrier: true, logoUrl: true } }),
    db.deliveryNetworkAccount.findMany({ where: { userId }, select: { id: true, network: true, label: true, status: true } }),
  ]);
  return listCarriers().flatMap((carrier) => {
    const partner = partners.find((p) => p.carrier === carrier.id);
    if (!partner) return [];
    const account = accounts.find((a) => a.network === carrier.id) ?? null;
    return [{
      id: carrier.id,
      name: carrier.name,
      partnerId: partner.id,
      logoUrl: partner.logoUrl,
      viaShopinbos: carrier.configured(),
      account,
      credentialFields: carrier.credentialFields,
    }];
  });
}

export type SellerNetwork = Awaited<ReturnType<typeof sellerNetworks>>[number];

/** Which account a booking would use: the seller's own when connected, else Shopinbos's. */
async function accountFor(network: SellerNetwork): Promise<{ via: "own"; accountId: string; credentials: CarrierCredentials } | { via: "shopinbos" } | null> {
  if (network.account) {
    const credentials = await networkCredentials(network.account.id);
    if (credentials) return { via: "own", accountId: network.account.id, credentials };
  }
  return network.viaShopinbos ? { via: "shopinbos" } : null;
}

async function jobFor(userId: string, request: NetworkRequest): Promise<CarrierJobInput> {
  const codAmount = await orderCollectAmount(userId, request.orderId);
  const notes = [request.description, request.fragile ? "Fragile" : null, request.notes].filter(Boolean).join(" · ") || null;
  return carrierJobInput({
    sellerId: userId,
    pickupLocation: request.pickupLocation,
    destination: request.destination,
    orderId: request.orderId,
    recipient: request.recipient,
    pickupPhone: request.pickupPhone,
    weightKg: request.weightKg,
    codAmount,
    notes,
  });
}

/**
 * One price to show. `name` is whoever set the price: the network, or for an aggregator (Shipbubble) the courier,
 * with `networkName` saying which network it comes through and `option` picking that courier when booking.
 */
export type NetworkOffer =
  | { network: string; option?: string; name: string; networkName: string; eta?: string | null; ok: true; via: "own" | "shopinbos"; price: number; fee: number; total: number; currency: string }
  | { network: string; option?: string; name: string; networkName: string; ok: false; error: string };

const priced = (price: number, via: "own" | "shopinbos") => (via === "own" ? { price, fee: 0, total: price } : networkTotal(price));

/** Live prices from every network the seller can book, side by side (one failing doesn't stop the others). */
export async function compareNetworks(userId: string, request: NetworkRequest): Promise<NetworkOffer[]> {
  const networks = await sellerNetworks(userId);
  const job = await jobFor(userId, request);
  const lists = await Promise.all(
    networks.map(async (network): Promise<NetworkOffer[]> => {
      const carrier = carrierFor({ carrier: network.id })!;
      const base = { network: network.id, name: network.name, networkName: network.name };
      const account = await accountFor(network);
      if (!account) return [{ ...base, ok: false, error: `${network.name} isn't available right now.` }];
      const credentials = account.via === "own" ? account.credentials : null;
      if (carrier.options) {
        // An aggregator: every courier it prices is its own line, priced by that courier.
        const options = await carrier.options(job, credentials).catch(() => null);
        if (!options?.ok) return [{ ...base, ok: false, error: options?.error ?? `${network.name} isn't answering right now.` }];
        return options.value.map((option) => ({ ...base, option: option.id, name: option.name, eta: option.eta, ok: true as const, via: account.via, currency: option.currency, ...priced(option.price, account.via) }));
      }
      const quote = await carrier.quote(job, credentials).catch(() => null);
      if (!quote?.ok) return [{ ...base, ok: false, error: quote?.error ?? `${network.name} isn't answering right now.` }];
      return [{ ...base, ok: true, via: account.via, currency: quote.value.currency, ...priced(quote.value.price, account.via) }];
    }),
  );
  return lists.flat();
}

// ─── Booking ──────────────────────────────────────────────────────────────────

const bookingData = (userId: string, partnerId: string, request: NetworkRequest, courier?: string | null) => ({
  sellerId: userId,
  logisticsPartnerId: partnerId,
  orderId: request.orderId ?? null,
  pickupLocation: request.pickupLocation,
  destination: request.destination,
  packageDetails: {
    fragile: request.fragile,
    ...(request.weightKg ? { weight: request.weightKg } : {}),
    ...(request.description ? { description: request.description } : {}),
  },
  // An aggregator's courier ("Courier: GIG logistics") goes first, so the seller sees who is delivering.
  notes: [courier ? `Courier: ${courier}` : null, request.notes].filter(Boolean).join(" · ") || null,
});

/**
 * Books a network delivery: at once on the seller's own account, or by sending them to pay on Shopinbos's account.
 * Refuses when the live price is above what they saw (expectedPrice is the network's price, before any fee).
 */
export async function bookNetwork(user: { id: string; email: string | null }, input: { network: string; option?: string; request: NetworkRequest; expectedPrice: number }) {
  const network = (await sellerNetworks(user.id)).find((n) => n.id === input.network);
  if (!network) throw new NetworkError("NOT_FOUND", "That delivery network isn't available.");
  const carrier = carrierFor({ carrier: network.id })!;
  const account = await accountFor(network);
  if (!account) throw new NetworkError("NOT_CONFIGURED", `${network.name} isn't available right now.`);
  if (carrier.options && !input.option) throw new NetworkError("BAD_REQUEST", `Pick a courier from ${network.name}.`);
  const job = await jobFor(user.id, input.request);

  // The live price now (and, for an aggregator, the chosen courier's name).
  let livePrice: { price: number; currency: string; courier: string | null };
  if (carrier.options) {
    const options = await carrier.options(job, account.via === "own" ? account.credentials : null);
    if (!options.ok) throw new NetworkError(options.code, options.error);
    const option = options.value.find((o) => o.id === input.option);
    if (!option) throw new NetworkError("PRICE_CHANGED", "That courier can't take this delivery any more. Compare prices again.");
    livePrice = { price: option.price, currency: option.currency, courier: option.name };
  } else if (account.via === "shopinbos") {
    const quote = await carrier.quote(job);
    if (!quote.ok) throw new NetworkError(quote.code, quote.error);
    livePrice = { ...quote.value, courier: null };
  } else {
    livePrice = { price: input.expectedPrice, currency: "NGN", courier: null };
  }
  const who = livePrice.courier ?? network.name;
  if (livePrice.price > input.expectedPrice + 0.005) {
    throw new NetworkError("PRICE_CHANGED", `${who}'s price for this delivery is now ₦${livePrice.price.toLocaleString("en-NG")}. Check the new price and book again.`);
  }
  const data = bookingData(user.id, network.partnerId, input.request, livePrice.courier);

  if (account.via === "own") {
    const res = await createCarrierBooking({ carrier, job, maxPrice: input.expectedPrice, optionId: input.option, credentials: account.credentials, data: { ...data, networkAccountId: account.accountId } });
    if (!res.ok) throw new NetworkError(res.code, res.error);
    return { kind: "booked" as const, booking: res.value };
  }

  const { price, fee, total } = networkTotal(livePrice.price);
  const reference = `${NETWORK_REFERENCE_PREFIX}${randomUUID()}`;
  const checkout = await db.deliveryNetworkCheckout.create({
    data: {
      sellerId: user.id,
      network: network.id,
      logisticsPartnerId: network.partnerId,
      request: { job: { ...job, pickupAt: job.pickupAt?.toISOString() ?? null }, booking: data, option: input.option ?? null } as unknown as Prisma.InputJsonValue,
      networkPrice: price,
      fee,
      total,
      currency: livePrice.currency,
      paymentRef: reference,
    },
  });
  const session = await initializePaystackTransaction({
    email: billingEmail(user),
    amountKobo: Math.round(total * 100),
    reference,
    callbackUrl: new URL("/api/app/logistics/networks/callback", appOrigin()).toString(),
    metadata: { purpose: "delivery_network", checkout_id: checkout.id, network: network.id, user_id: user.id },
  });
  return { kind: "pay" as const, authorizationUrl: session.authorization_url, checkoutId: checkout.id };
}

type CheckoutRequest = { job: Omit<CarrierJobInput, "pickupAt"> & { pickupAt: string | null }; booking: ReturnType<typeof bookingData>; option?: string | null };

/**
 * After the seller paid: verifies the payment once (callback and webhook may both call this), books the job with
 * the network on Shopinbos's account, and refunds the payment if the network won't take it.
 */
export async function completeNetworkCheckout(reference: string): Promise<"booked" | "failed" | "pending"> {
  const row = await db.deliveryNetworkCheckout.findUnique({ where: { paymentRef: reference } });
  if (!row) return "failed";
  if (row.status === "booked") return "booked";
  if (row.status === "failed") return "failed";
  if (row.status === "booking") return "pending";

  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== "success") return verified.status === "abandoned" || verified.status === "failed" ? "failed" : "pending";
  if (Number(verified.amount) < Math.round(row.total * 100)) return "failed";

  // Only one caller books it.
  const claimed = await db.deliveryNetworkCheckout.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "booking", paidAt: new Date() } });
  if (claimed.count !== 1) return "pending";

  const carrier = carrierFor({ carrier: row.network });
  const request = row.request as unknown as CheckoutRequest;
  let error: string;
  if (!carrier) {
    error = "This delivery network isn't available any more.";
  } else {
    const job: CarrierJobInput = { ...request.job, pickupAt: request.job.pickupAt ? new Date(request.job.pickupAt) : null };
    const res = await createCarrierBooking({
      carrier,
      job,
      // The seller paid this network price: never book above it.
      maxPrice: row.networkPrice,
      optionId: request.option ?? null,
      data: { ...request.booking, platformFee: row.fee, feeBearer: "seller", netAmount: row.networkPrice },
    }).catch((err: unknown) => ({ ok: false as const, code: "UNAVAILABLE" as const, error: err instanceof Error ? err.message : "We couldn't save the booking." }));
    if (res.ok) {
      await db.deliveryNetworkCheckout.update({ where: { id: row.id }, data: { status: "booked", bookingId: res.value.id } });
      await createNotification({
        userId: row.sellerId,
        type: "logistics",
        priority: "success",
        title: `${carrier.name} delivery booked`,
        description: `Paid ₦${row.total.toLocaleString("en-NG")} (${carrier.name} ₦${row.networkPrice.toLocaleString("en-NG")} + Shopinbos fee ₦${row.fee.toLocaleString("en-NG")}). ${carrier.name} will send a rider.`,
        link: "/home/logistics#networks",
        metadata: { bookingId: res.value.id, network: row.network },
      }).catch(() => null);
      return "booked";
    }
    error = res.error;
  }

  await db.deliveryNetworkCheckout.update({ where: { id: row.id }, data: { status: "failed", error: error.slice(0, 500) } });
  const refunded = await refundCheckout(row.id);
  await createNotification({
    userId: row.sellerId,
    type: "logistics",
    priority: "warning",
    title: "We couldn't book that delivery",
    description: `${error} ${refunded ? `Your ₦${row.total.toLocaleString("en-NG")} is being refunded.` : "Our team will refund you."}`,
    link: "/home/logistics#networks",
    metadata: { checkoutId: row.id, network: row.network },
    sendEmail: true,
  }).catch(() => null);
  return "failed";
}

/** Refunds a paid checkout in full, once. True when Paystack accepted the refund. */
async function refundCheckout(checkoutId: string) {
  const claimed = await db.deliveryNetworkCheckout.updateMany({ where: { id: checkoutId, paidAt: { not: null }, refundStatus: null }, data: { refundStatus: "pending" } });
  if (claimed.count !== 1) return false;
  const row = await db.deliveryNetworkCheckout.findUniqueOrThrow({ where: { id: checkoutId }, select: { paymentRef: true } });
  try {
    const refund = await refundPaystackTransaction(row.paymentRef);
    await db.deliveryNetworkCheckout.update({ where: { id: checkoutId }, data: { refundStatus: refund.status === "processed" ? "processed" : "pending" } });
    return true;
  } catch (error) {
    console.error(`[delivery networks] refund failed for checkout ${checkoutId}`, error);
    await db.deliveryNetworkCheckout.update({ where: { id: checkoutId }, data: { refundStatus: "failed" } });
    return false;
  }
}

/**
 * The seller cancels a network delivery before pickup: cancelled with the network, then, when it was paid through
 * Shopinbos, refunded in full.
 */
export async function cancelNetworkBooking(bookingId: string, sellerId: string) {
  const res = await cancelCarrierBooking(bookingId, sellerId);
  if (!res.ok) return res;
  const checkout = await db.deliveryNetworkCheckout.findUnique({ where: { bookingId }, select: { id: true } });
  const refunded = checkout ? await refundCheckout(checkout.id) : false;
  return { ok: true as const, refunded };
}

// ─── Seller's own accounts ────────────────────────────────────────────────────

/** Checks and saves a seller's own network account (replacing one already connected). */
export async function connectNetworkAccount(userId: string, network: string, credentials: CarrierCredentials) {
  const carrier: Carrier | null = carrierFor({ carrier: network });
  if (!carrier) throw new NetworkError("NOT_FOUND", "Unknown delivery network.");
  if (!canStoreNetworkAccounts()) throw new NetworkError("NOT_CONFIGURED", "Connecting your own account isn't available yet.");
  const clean: CarrierCredentials = {};
  for (const field of carrier.credentialFields) {
    const value = credentials[field.key]?.trim();
    if (!value) throw new NetworkError("BAD_REQUEST", `Add your ${field.label}.`);
    clean[field.key] = value;
  }
  const verified = await carrier.verify(clean);
  if (!verified.ok) throw new NetworkError(verified.code === "UNAVAILABLE" ? "UNAVAILABLE" : "BAD_REQUEST", verified.code === "UNAVAILABLE" ? verified.error : `${carrier.name} didn't accept those details. Check them and try again.`);
  const sealed = sealCredentials(clean);
  return db.deliveryNetworkAccount.upsert({
    where: { userId_network: { userId, network: carrier.id } },
    create: { userId, network: carrier.id, credentials: sealed, label: verified.value.label.slice(0, 120) },
    update: { credentials: sealed, label: verified.value.label.slice(0, 120), status: "connected", lastError: null },
    select: { id: true, network: true, label: true, status: true },
  });
}

/** Disconnects a seller's own account. Jobs already booked on it keep syncing until it's gone. */
export async function disconnectNetworkAccount(userId: string, network: string) {
  const open = await db.deliveryBooking.count({
    where: { sellerId: userId, externalCarrier: network, networkAccountId: { not: null }, status: { in: ["pending", "confirmed", "picked_up", "in_transit"] } },
  });
  if (open > 0) throw new NetworkError("BAD_REQUEST", "You have deliveries on this account still on the way. Disconnect it once they're done.");
  await db.deliveryNetworkAccount.deleteMany({ where: { userId, network } });
}
