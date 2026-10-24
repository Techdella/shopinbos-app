// What Peggy knows about the person's dashboard on a call ("Call Peggy"): a short English snapshot per role, sent as
// the {{dashboard}} dynamic variable when the call starts and again by the get_dashboard tool after saves. The facts
// are read server-side (src/lib/ai/peggy-dashboard.server.ts) from the same helpers the dashboards use; this file
// only words them. Pure, unit-tested in tests/peggy-call.test.mjs. Short on purpose: a phone agent reads it every turn.

export interface SellerSnapshot {
  shop: string;
  url: string | null;
  live: boolean;
  plan: string;
  products: number;
  lowStock: number;
  outOfStock: number;
  ordersToday: number;
  ordersWeek: number;
  unpaid: number;
  toSend: number;
  bankSet: boolean;
  deliverySet: boolean;
  credits: number;
  unreadChats: number;
  reviewsMonth: number;
}

export interface SupplierSnapshot {
  business: string;
  verification: string;
  products: number;
  published: number;
  lowStock: number;
  toAccept: number;
  toSend: number;
  quotes: number;
  bankSet: boolean;
  pickupSet: boolean;
  deliveryPartners: number;
  selfDelivery: boolean;
}

export interface PartnerSnapshot {
  company: string;
  verification: string;
  cacNumber: boolean;
  coverage: string[];
  pickupPoints: number;
  ratesSet: boolean;
  startingPrice: number;
  riders: number;
  newJobs: number;
  activeJobs: number;
  unassigned: number;
  cashOwed: number;
  bankSet: boolean;
}

const yes = (value: boolean) => (value ? "yes" : "no");
const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const VERIFICATION: Record<string, string> = { verified: "verified", pending: "waiting for the team's review", rejected: "not approved yet (they need to fix something)", suspended: "suspended" };
const verificationText = (status: string) => VERIFICATION[status] ?? status;

export function sellerSnapshot(f: SellerSnapshot) {
  return [
    `Shop: ${f.shop}${f.url ? ` (${f.url})` : ""}. Published: ${f.live ? "yes, it's live" : "no, not yet"}. Plan: ${f.plan}.`,
    `Products: ${f.products}${f.lowStock || f.outOfStock ? ` (${f.lowStock} running low, ${f.outOfStock} sold out)` : ""}.`,
    `Orders: ${f.ordersToday} today, ${f.ordersWeek} this week; ${f.unpaid} not paid yet, ${f.toSend} to send out.`,
    `Payout bank set: ${yes(f.bankSet)}. Delivery set up: ${yes(f.deliverySet)}. AI credits: ${f.credits}.`,
    `Unread chats: ${f.unreadChats}. Reviews in the last 30 days: ${f.reviewsMonth}.`,
  ].join("\n");
}

export function supplierSnapshot(f: SupplierSnapshot) {
  return [
    `Business: ${f.business}. Verification: ${verificationText(f.verification)}.`,
    `Products: ${f.products} (${f.published} live${f.lowStock ? `, ${f.lowStock} running low` : ""}).`,
    `Dropship and wholesale orders: ${f.toAccept} waiting to be accepted, ${f.toSend} to send. Quotes waiting: ${f.quotes}.`,
    `Bank for payments set: ${yes(f.bankSet)}. Pickup address set: ${yes(f.pickupSet)}. Delivery: ${f.selfDelivery ? "delivers itself" : f.deliveryPartners ? plural(f.deliveryPartners, "delivery company") : "no delivery company yet"}.`,
  ].join("\n");
}

export function partnerSnapshot(f: PartnerSnapshot) {
  const areas = f.coverage.length ? `${f.coverage.slice(0, 6).join(", ")}${f.coverage.length > 6 ? ` and ${f.coverage.length - 6} more` : ""}` : "none yet";
  return [
    `Company: ${f.company}. Verification: ${verificationText(f.verification)}. CAC number given: ${yes(f.cacNumber)}.`,
    `Delivers to: ${areas}. Pickup points: ${f.pickupPoints}. Rates set: ${f.ratesSet ? `yes${f.startingPrice > 0 ? `, from ${naira(f.startingPrice)}` : ""}` : "no"}.`,
    `Riders: ${f.riders}. Jobs: ${f.newJobs} new waiting, ${f.activeJobs} active${f.unassigned ? `, ${f.unassigned} with no rider yet` : ""}.`,
    `Pay-on-delivery cash owed to sellers: ${naira(f.cashOwed)}. Bank for payments set: ${yes(f.bankSet)}.`,
  ].join("\n");
}
