// Group buy (pilot "group_buy"): a lower price unlocks when enough people join within a time window. Nobody is
// charged unless the group fills. Pure rules (no imports) for the server, the storefront, the apps and
// tests/group-buy.test.mjs.
//
// How the money moves: joining saves the shopper's card with a tiny card check (GROUP_VERIFY_KOBO) paid straight to
// the seller's own bank like every other payment (Shopinbos never holds it). When the group fills, each member's saved
// card is charged the group price less the card check (groupChargeKobo) in a Paystack payment split straight to the
// seller (Shopinbos's fee in the same split), and their order is created. If the group doesn't fill, the shop sends the
// card check back (the seller is told who to refund). A card that can't be charged gets a pay link for PAY_LINK_HOURS; then
// that member is dropped. A group that doesn't fill by its deadline is cancelled and nobody is charged.

export const GROUP_BUY_FEATURE = "group_buy";
export const GROUP_MIN_SIZE = 2;
export const GROUP_MAX_SIZE = 20;
export const GROUP_WINDOW_HOURS = [6, 12, 24, 48, 72] as const;
export const GROUP_DEFAULT_HOURS = 24;
/** The card check when joining (Paystack's smallest NGN charge): paid to the seller, then taken off the group price. */
export const GROUP_VERIFY_KOBO = 5_000;

/** What a member's card is charged when the group fills: the group price less the card check they already paid. */
export function groupChargeKobo(priceKobo: number): number {
  return Math.max(0, Math.round(priceKobo) - GROUP_VERIFY_KOBO);
}
/** A member whose card can't be charged when the group fills has this long to pay with the link. */
export const PAY_LINK_HOURS = 2;
/** The group price must leave the seller at least this after Shopinbos's fee (Paystack's smallest split share). */
export const GROUP_MIN_PRICE_KOBO = 20_000;

export const GROUP_VERIFY_PREFIX = "GBV-";
export const GROUP_CHARGE_PREFIX = "GBC-";

export const GROUP_STATUSES = ["open", "filled", "charged", "cancelled"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];
/** pending: card check not done; joined: card saved; charged: paid (order made); pay_link: card failed, link sent;
 *  dropped: didn't pay in time; cancelled: the group didn't fill. */
export const GROUP_MEMBER_STATUSES = ["pending", "joined", "charged", "pay_link", "dropped", "cancelled"] as const;
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number];

export function isWindowHours(value: unknown): value is (typeof GROUP_WINDOW_HOURS)[number] {
  return typeof value === "number" && (GROUP_WINDOW_HOURS as readonly number[]).includes(value);
}

/** Why these group-buy settings can't be saved, or null. Prices in kobo. */
export function groupSettingsProblem(input: { groupPriceKobo: number; retailKobo: number; size: number; hours: number }): string | null {
  if (!Number.isInteger(input.size) || input.size < GROUP_MIN_SIZE || input.size > GROUP_MAX_SIZE) return `A group has ${GROUP_MIN_SIZE} to ${GROUP_MAX_SIZE} people.`;
  if (!isWindowHours(input.hours)) return "Choose how long the group stays open.";
  if (!(input.groupPriceKobo >= GROUP_MIN_PRICE_KOBO)) return `The group price must be at least ₦${GROUP_MIN_PRICE_KOBO / 100}.`;
  if (!(input.groupPriceKobo < Math.round(input.retailKobo))) return "The group price must be lower than the normal price.";
  return null;
}

/** People who count towards filling the group (card saved, or already paid / waiting to pay after it filled). */
export function countsTowardsGroup(status: string): boolean {
  return status === "joined" || status === "charged" || status === "pay_link";
}

export function joinedCount(members: ReadonlyArray<{ status: string }>): number {
  return members.filter((member) => countsTowardsGroup(member.status)).length;
}

/** Where a group stands right now. An open group past its deadline is "expired" (to be cancelled). */
export function groupState(group: { status: string; size: number; endsAt: Date | string }, joined: number, now: Date | number): "open" | "full" | "expired" | "closed" {
  if (group.status !== "open") return "closed";
  if (joined >= group.size) return "full";
  return new Date(now).getTime() >= new Date(group.endsAt).getTime() ? "expired" : "open";
}

/** "05:42" (hours:minutes left, hours can go past 24), and the parts. Zero when it has ended. */
export function timeLeft(endsAt: Date | string | number, now: Date | number): { hours: number; minutes: number; label: string; ended: boolean } {
  const ms = Math.max(0, new Date(endsAt).getTime() - new Date(now).getTime());
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes, label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`, ended: ms <= 0 };
}

/** When a member who got a pay link is dropped. */
export function payLinkDeadline(from: Date | number, hours = PAY_LINK_HOURS): Date {
  return new Date(new Date(from).getTime() + hours * 60 * 60 * 1000);
}

/** What a member saves by buying with the group, in kobo (never below 0). */
export function savingKobo(retailKobo: number, groupPriceKobo: number): number {
  return Math.max(0, Math.round(retailKobo) - Math.round(groupPriceKobo));
}

/**
 * What a group that filled turns into once every card has been tried: "charged" when nobody is left to pay
 * (everyone paid or was dropped), else still "filled" (pay links are open).
 */
export function statusAfterCharges(members: ReadonlyArray<{ status: string }>): "charged" | "filled" {
  return members.some((member) => member.status === "pay_link" || member.status === "joined") ? "filled" : "charged";
}

/** Paystack charge_authorization outcomes: only "success" is a payment; anything else gets a pay link. */
export function chargeOutcome(status: string | null | undefined): "paid" | "pay_link" {
  return status === "success" ? "paid" : "pay_link";
}

/** The WhatsApp share text for a group. */
export function groupShareText(input: { productName: string; storeName: string; priceText: string; size: number; joined: number; url: string; timeLeftLabel: string }): string {
  const left = Math.max(0, input.size - input.joined);
  return `Join my group buy for ${input.productName} at ${input.storeName}: ${input.priceText} each when ${input.size} of us join. ${left === 1 ? "1 more person" : `${left} more people`} needed, ends in ${input.timeLeftLabel}. Nobody pays unless the group fills. ${input.url}`;
}
