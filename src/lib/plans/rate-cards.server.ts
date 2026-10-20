import "server-only";
import { db } from "@/lib/db/client";
import { planKeyFor, sellerLimits, supplierLimits } from "@shared/plans";

// Private rate cards (PrivateRateCard): a delivery partner's own price for one seller or supplier. The customer's
// plan must include them (Seller Starter and up, Supplier Plus and up) for the price to apply.

async function customerMayUse(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, aiCredits: true } });
  if (user?.role === "seller") return sellerLimits(planKeyFor("seller", user.aiCredits)).privateRateCards;
  if (user?.role === "supplier") return supplierLimits(planKeyFor("supplier", user.aiCredits)).privateRateCards;
  return false;
}

const covers = (states: readonly string[], destination: string | null | undefined) =>
  states.length === 0 || (destination ? states.some((state) => destination.toLowerCase().includes(state.toLowerCase())) : false);

/** The private price `customerUserId` gets from `partnerId` for a delivery to `destination`, or null. */
export async function privateRateFor(customerUserId: string, partnerId: string, destination?: string | null): Promise<number | null> {
  const card = await db.privateRateCard.findUnique({ where: { logisticsPartnerId_customerUserId: { logisticsPartnerId: partnerId, customerUserId } } }).catch(() => null);
  if (!card?.active || !covers(card.states, destination) || !(await customerMayUse(customerUserId))) return null;
  return card.price;
}

/** Every active card a customer has, by partner id (for partner lists). Empty when their plan doesn't include them. */
export async function privateRatesByPartner(customerUserId: string): Promise<Map<string, { price: number; label: string; states: string[] }>> {
  if (!(await customerMayUse(customerUserId).catch(() => false))) return new Map();
  const cards = await db.privateRateCard.findMany({ where: { customerUserId, active: true }, select: { logisticsPartnerId: true, price: true, label: true, states: true } }).catch(() => []);
  return new Map(cards.map((card) => [card.logisticsPartnerId, { price: card.price, label: card.label, states: card.states }]));
}
