import "server-only";

import { db } from "@/lib/db/client";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { findPartners, connectPartner } from "@/lib/delivery-market/manage.server";
import { LIVE_PARTNER_WHERE } from "@/lib/delivery-market/market.server";
import { deliveryPartnerProblem } from "@/lib/plans/gates.server";
import { notifyDeliveryQuoteRequested } from "@/lib/notifications/events.server";
import { addressLines } from "@/lib/labels";
import { naira } from "@shared/onboarding";
import { bestRate, isSizeBand, placeOf, readRateRows, timeframeWords, type Place } from "@shared/delivery-market";
import { pickDeliveryMatches } from "./delivery-specs";
import type { PeggyToolInput } from "./pure";
import { findOrder, recordActivity, ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy's delivery tools: the best delivery companies for an order (by where the customer is and the seller's
// budget), a quote request to one of them, and connecting one so checkout books them. Sending a quote request and
// connecting need the seller's yes (a confirmation code tied to exactly what will happen).

const placeWords = (place: Place) => [place.area, place.state].filter(Boolean).join(", ") || "not set";

type DeliveryAddress = { street?: string; city?: string; state?: string; area?: string } | null;

async function findDeliveryPartners(ctx: PeggyToolContext, input: PeggyToolInput<"find_delivery_partners">): Promise<ToolOutput> {
  const order = input.orderNumber ? await findOrder(ctx, input.orderNumber) : null;
  const destination = order ? placeOf(order.deliveryAddress as DeliveryAddress) : placeOf({ state: input.state, city: input.state });
  if (!destination.state && !input.state && !order) throw new ToolError("Say which order this is for, or where the parcel is going.");
  const { origin, settings, rows } = await findPartners({ id: ctx.userId, role: "seller" }, { state: destination.state ?? input.state ?? null });
  const sizeBand = isSizeBand(settings.defaultSizeBand) ? settings.defaultSizeBand : "small";
  const interstate = !!origin.state && !!destination.state && origin.state !== destination.state;

  const priced = rows
    .filter((row) => !interstate || row.partner.services.includes("interstate"))
    .map((row) => {
      const card = readRateRows(row.partner.rateCards[0]?.rows);
      const trip = destination.state ? bestRate(card, { origin, destination, service: "doorstep", sizeBand }) : null;
      return {
        name: row.partner.displayName,
        slug: row.partner.slug,
        price: trip?.price ?? row.startingPrice ?? 0,
        priced: !!trip,
        score: row.score,
        takes: trip ? timeframeWords(trip.minDays, trip.maxDays) : row.timeframe,
        rating: row.partner.ratingCount ? `${row.partner.rating.toFixed(1)} from ${row.partner.ratingCount} reviews` : "no reviews yet",
        onTime: row.stats.onTimeRate === null ? null : `${row.stats.onTimeRate}% on time`,
        deliveredOnShopinbos: row.stats.completed,
        payOnDelivery: row.partner.offersPayOnDelivery,
        pickupPoints: row.pickupPointCount,
        alreadyYourPartner: !!row.connectionId,
        link: `/home/logistics/partners/${row.partner.slug}`,
      };
    });
  const { matches, withinBudget } = pickDeliveryMatches(priced, input.budget, input.limit ?? 3);
  const items = order && Array.isArray(order.items) ? (order.items as Array<{ name?: string; quantity?: number }>) : [];

  return {
    content: JSON.stringify({
      order: order
        ? {
            orderNumber: order.orderNumber,
            customer: order.buyerName,
            deliverTo: addressLines(order.deliveryAddress).join(", ") || "no address on the order",
            items: items.map((item) => `${Number(item.quantity ?? 1)} × ${String(item.name ?? "Item")}`).join(", "),
            deliveryFeeCustomerPaid: naira(Number(order.shippingFee ?? 0)),
            link: `/home/orders/${order.id}`,
          }
        : null,
      from: placeWords(origin),
      to: placeWords(destination),
      interstate,
      parcelSize: sizeBand,
      budget: input.budget ? naira(input.budget) : null,
      withinBudget,
      partners: matches.map(({ score: _score, price, priced: exact, ...rest }) => ({ ...rest, price: exact ? naira(price) : `from ${naira(price)}`, priceIsForThisTrip: exact })),
      none: matches.length === 0 ? "No verified delivery partner covers this trip yet. Point the seller to /home/logistics/partners to search more widely, or to set where they send from at /home/logistics/settings." : undefined,
      ...(origin.state ? {} : { note: "The shop hasn't set where it sends from, so prices are rough. Settings: /home/logistics/settings." }),
    }),
  };
}

async function livePartner(name: string) {
  const wanted = name.trim();
  const partner = await db.logisticsPartner.findFirst({
    where: { ...LIVE_PARTNER_WHERE, OR: [{ slug: wanted.toLowerCase() }, { displayName: { equals: wanted, mode: "insensitive" } }, { displayName: { contains: wanted, mode: "insensitive" } }] },
    select: { id: true, slug: true, displayName: true },
  });
  if (!partner) throw new ToolError(`No verified delivery partner called "${wanted}". Use find_delivery_partners to see who covers this trip.`);
  return partner;
}

async function requestDeliveryQuote(ctx: PeggyToolContext, input: PeggyToolInput<"request_delivery_quote">): Promise<ToolOutput> {
  const [order, partner] = await Promise.all([findOrder(ctx, input.orderNumber), livePartner(input.partner)]);
  const destination = addressLines(order.deliveryAddress).join(", ");
  if (destination.length < 2) throw new ToolError(`Order ${order.orderNumber} has no delivery address, so there's nothing to quote. The seller can add it on the order page.`);
  const [settings, store] = await Promise.all([
    db.deliverySettings.findUnique({ where: { userId: ctx.userId }, select: { originAddress: true, originArea: true, originState: true } }),
    db.store.findUnique({ where: { id: ctx.store.id }, select: { city: true } }),
  ]);
  const pickup = (settings?.originAddress || [settings?.originArea, settings?.originState].filter(Boolean).join(", ") || store?.city || "").trim();
  if (pickup.length < 2) throw new ToolError("The shop hasn't said where parcels are picked up. Ask the seller for the pickup address, or send them to /home/logistics/settings to set it.");
  const preferred = input.preferredDate && /^\d{4}-\d{2}-\d{2}$/.test(input.preferredDate) ? new Date(`${input.preferredDate}T09:00:00+01:00`) : null;
  if (preferred && preferred.getTime() < Date.now() - 86_400_000) throw new ToolError("That pickup date has passed. Ask for today or a later day.");
  const items = (Array.isArray(order.items) ? order.items : []) as Array<{ name?: string; quantity?: number }>;
  const description = `Order ${order.orderNumber}: ${items.map((item) => `${Number(item.quantity ?? 1)} × ${String(item.name ?? "Item")}`).join(", ")}`.slice(0, 500);
  const fragile = input.fragile === true;

  const parts = [ctx.store.id, "delivery-quote", order.id, partner.id, input.preferredDate ?? "", String(fragile)];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return {
      content: [
        `NOT SENT YET. Preview of the quote request to ${partner.displayName}:`,
        `- Pickup: ${pickup}`,
        `- Deliver to: ${destination} (${order.buyerName})`,
        `- Parcel: ${description}${fragile ? " (fragile)" : ""}`,
        `- Pickup day: ${input.preferredDate ?? "as soon as possible"}`,
        `They reply with a price on the seller's Logistics page (/home/logistics), where the seller accepts it. Nothing is paid now.`,
        `Confirmation code: ${confirmationCode(parts)}. Show the seller this; only call request_delivery_quote again with the same details and this code after they clearly say yes.${input.confirmCode ? " (The code given was wrong, expired, or for different details.)" : ""}`,
      ].join("\n"),
    };
  }

  const planProblem = await deliveryPartnerProblem(ctx.userId, partner.id);
  if (planProblem) throw new ToolError(planProblem);
  const quote = await db.deliveryQuoteRequest.create({
    data: { sellerId: ctx.userId, logisticsPartnerId: partner.id, pickupLocation: pickup.slice(0, 300), destination: destination.slice(0, 300), packageDetails: { fragile, description }, preferredDate: preferred },
  });
  await notifyDeliveryQuoteRequested(quote.id);
  const summary = `Asked ${partner.displayName} for a delivery price for order ${order.orderNumber} (to ${destination}). Their answer shows on Logistics.`;
  await recordActivity(ctx, { type: "delivery_quote_requested", title: summary, tool: "request_delivery_quote", link: "/home/logistics", data: { quoteId: quote.id, orderId: order.id } });
  return { content: `${summary} Nothing is booked or paid until the seller accepts their price at /home/logistics.`, action: { summary, href: "/home/logistics" } };
}

async function connectDeliveryPartner(ctx: PeggyToolContext, input: PeggyToolInput<"connect_delivery_partner">): Promise<ToolOutput> {
  const partner = await livePartner(input.partner);
  const parts = [ctx.store.id, "delivery-connect", partner.id];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return {
      content: `NOT CONNECTED YET. ${partner.displayName} would become one of the shop's delivery partners at their public prices: checkout can offer them, and new paid orders to places they cover go to them as jobs. The seller can end it any time at /home/logistics. Confirmation code: ${confirmationCode(parts)}. Only call connect_delivery_partner again with this code after the seller clearly says yes.${input.confirmCode ? " (The code given was wrong or expired.)" : ""}`,
    };
  }
  const result = await connectPartner({ id: ctx.userId, role: "seller" }, partner.id);
  if (!result.ok) throw new ToolError(result.error);
  const summary = `Added ${partner.displayName} as a delivery partner. New paid orders to the places they cover go to them.`;
  await recordActivity(ctx, { type: "delivery_partner_connected", title: summary, tool: "connect_delivery_partner", link: `/home/logistics/partners/${partner.slug}` });
  return { content: `${summary} Orders already waiting still need booking: ask them for a quote with request_delivery_quote, or book from /home/logistics.`, action: { summary, href: `/home/logistics/partners/${partner.slug}` } };
}

export const DELIVERY_TOOL_RUNNERS = {
  find_delivery_partners: findDeliveryPartners,
  request_delivery_quote: requestDeliveryQuote,
  connect_delivery_partner: connectDeliveryPartner,
};
