// What Peggy and Rex bring up on their own for suppliers and delivery partners, the way Peggy's brief does for
// sellers on /home. Peggy's brief is what needs doing now (orders running out of time, contracts to sign, cash to
// pay in); Rex's ideas are ways to grow (publish drafts, add a rate card, more pickup points). Both come from the
// account's own numbers (src/lib/dashboard/partner-brief.server.ts gathers them), never from guesses.
//
// Pure, so the web dashboards, the help chat, the Rex drawer, the morning notification and tests/partner-brief.test.mjs
// share the same rules. Words: the "briefs" namespace, keys `<role>.<key>.title|hint|action`.

export type BriefWho = "peggy" | "rex";
export type BriefIcon = "truck" | "chat" | "box" | "coin" | "shield" | "document" | "users" | "pin" | "star" | "clock" | "tag";

export interface BriefItem {
  key: string;
  who: BriefWho;
  icon: BriefIcon;
  href: string;
  /** For the {count} in the words. */
  count?: number;
  /** Running out of time or money at stake: shown first and in red. */
  urgent?: boolean;
}

/** Rex's ideas shown at once; the rest wait until these are done. */
export const MAX_IDEAS = 3;

// ─── Suppliers ────────────────────────────────────────────────────────────────

export interface SupplierFacts {
  verificationStatus: string;
  /** Orders still waiting for the supplier to accept, and those of them with an hour or less left. */
  toAccept: number;
  dueSoon: number;
  /** Accepted orders not sent yet. */
  toSend: number;
  quotes: number;
  /** Shops asking to dropship, and contracts waiting for the supplier's signature. */
  agreementRequests: number;
  contractsToSign: number;
  disputesOpen: number;
  /** Money the supplier owes another business that is past due. */
  owedOverdue: number;
  walletReady: boolean;
  products: number;
  published: number;
  drafts: number;
  lowStock: number;
  hasReturnPolicy: boolean;
  hasLogo: boolean;
  hasDescription: boolean;
  missedOrders: number;
  deliveryPartners: number;
  selfDelivery: boolean;
}

export function supplierBrief(f: SupplierFacts): { peggy: BriefItem[]; rex: BriefItem[] } {
  const peggy: BriefItem[] = [];
  const add = (item: BriefItem, when: boolean) => { if (when) peggy.push(item); };
  add({ key: "dueSoon", who: "peggy", icon: "clock", href: "/supplier/orders", count: f.dueSoon, urgent: true }, f.dueSoon > 0);
  add({ key: "toAccept", who: "peggy", icon: "box", href: "/supplier/orders", count: f.toAccept - f.dueSoon }, f.toAccept - f.dueSoon > 0);
  add({ key: "toSend", who: "peggy", icon: "truck", href: "/supplier/orders", count: f.toSend }, f.toSend > 0);
  add({ key: "owedOverdue", who: "peggy", icon: "coin", href: "/supplier/wallet", urgent: true }, f.owedOverdue > 0);
  add({ key: "disputes", who: "peggy", icon: "document", href: "/supplier/contracts", count: f.disputesOpen, urgent: true }, f.disputesOpen > 0);
  add({ key: "agreements", who: "peggy", icon: "users", href: "/supplier/agreements", count: f.agreementRequests }, f.agreementRequests > 0);
  add({ key: "contracts", who: "peggy", icon: "document", href: "/supplier/contracts", count: f.contractsToSign }, f.contractsToSign > 0);
  add({ key: "quotes", who: "peggy", icon: "chat", href: "/supplier/quote-requests", count: f.quotes }, f.quotes > 0);
  add({ key: "firstProduct", who: "peggy", icon: "box", href: "/supplier/products/new" }, f.products === 0);
  add({ key: "verify", who: "peggy", icon: "shield", href: "/supplier/verification" }, f.verificationStatus !== "verified" && f.verificationStatus !== "pending");
  add({ key: "wallet", who: "peggy", icon: "coin", href: "/supplier/wallet" }, !f.walletReady);

  const rex: BriefItem[] = [];
  const idea = (item: Omit<BriefItem, "who">, when: boolean) => { if (when) rex.push({ ...item, who: "rex" }); };
  idea({ key: "publishDrafts", icon: "box", href: "/supplier/products", count: f.drafts }, f.drafts > 0);
  idea({ key: "restock", icon: "box", href: "/supplier/products", count: f.lowStock }, f.lowStock > 0);
  idea({ key: "missed", icon: "clock", href: "/supplier/settings", count: f.missedOrders }, f.missedOrders > 0);
  idea({ key: "returnPolicy", icon: "shield", href: "/supplier/profile" }, !f.hasReturnPolicy);
  idea({ key: "delivery", icon: "truck", href: "/supplier/delivery" }, f.deliveryPartners === 0 && !f.selfDelivery && f.products > 0);
  idea({ key: "profile", icon: "star", href: "/supplier/profile" }, !f.hasLogo || !f.hasDescription);
  idea({ key: "moreProducts", icon: "tag", href: "/supplier/products/new", count: f.published }, f.published > 0 && f.published < 10);
  return { peggy: urgentFirst(peggy), rex: rex.slice(0, MAX_IDEAS) };
}

// ─── Delivery partners ────────────────────────────────────────────────────────

export interface PartnerFacts {
  verificationStatus: string;
  /** New jobs waiting to be accepted, and those of them with an hour or less left. */
  newJobs: number;
  dueSoon: number;
  quotes: number;
  /** Jobs accepted with no rider on them yet. */
  unassigned: number;
  riders: number;
  /** Cash collected that must be paid in: overdue, or due today. */
  payInOverdue: boolean;
  cashToPayIn: number;
  contractsToSign: number;
  disputesOpen: number;
  walletReady: boolean;
  hasRateCard: boolean;
  hasCoverage: boolean;
  pickupPoints: number;
  offersPayOnDelivery: boolean;
  connections: number;
  privateRateCards: number;
  rating: number;
  ratingCount: number;
}

export function partnerBrief(f: PartnerFacts): { peggy: BriefItem[]; rex: BriefItem[] } {
  const peggy: BriefItem[] = [];
  const add = (item: BriefItem, when: boolean) => { if (when) peggy.push(item); };
  add({ key: "payInOverdue", who: "peggy", icon: "coin", href: "/logistics/cash", urgent: true }, f.payInOverdue);
  add({ key: "dueSoon", who: "peggy", icon: "clock", href: "/logistics/bookings", count: f.dueSoon, urgent: true }, f.dueSoon > 0);
  add({ key: "newJobs", who: "peggy", icon: "box", href: "/logistics/bookings", count: f.newJobs - f.dueSoon }, f.newJobs - f.dueSoon > 0);
  add({ key: "unassigned", who: "peggy", icon: "truck", href: "/logistics/bookings", count: f.unassigned }, f.unassigned > 0);
  add({ key: "payIn", who: "peggy", icon: "coin", href: "/logistics/cash" }, !f.payInOverdue && f.cashToPayIn > 0);
  add({ key: "disputes", who: "peggy", icon: "document", href: "/logistics/contracts", count: f.disputesOpen, urgent: true }, f.disputesOpen > 0);
  add({ key: "contracts", who: "peggy", icon: "document", href: "/logistics/contracts", count: f.contractsToSign }, f.contractsToSign > 0);
  add({ key: "quotes", who: "peggy", icon: "chat", href: "/logistics/quotes", count: f.quotes }, f.quotes > 0);
  add({ key: "verify", who: "peggy", icon: "shield", href: "/logistics/verification" }, f.verificationStatus !== "verified" && f.verificationStatus !== "pending");
  add({ key: "riders", who: "peggy", icon: "users", href: "/logistics/couriers" }, f.riders === 0);
  add({ key: "wallet", who: "peggy", icon: "coin", href: "/logistics/wallet" }, !f.walletReady);

  const rex: BriefItem[] = [];
  const idea = (item: Omit<BriefItem, "who">, when: boolean) => { if (when) rex.push({ ...item, who: "rex" }); };
  idea({ key: "rateCard", icon: "tag", href: "/logistics/rates" }, !f.hasRateCard);
  idea({ key: "coverage", icon: "pin", href: "/logistics/coverage" }, !f.hasCoverage);
  idea({ key: "pickupPoints", icon: "pin", href: "/logistics/pickup-points" }, f.pickupPoints === 0);
  idea({ key: "privateRates", icon: "users", href: "/logistics/connections", count: f.connections }, f.connections > 0 && f.privateRateCards === 0);
  idea({ key: "payOnDelivery", icon: "coin", href: "/logistics/coverage#where-you-work" }, !f.offersPayOnDelivery && f.riders > 0);
  idea({ key: "rating", icon: "star", href: "/logistics/reviews" }, f.ratingCount >= 5 && f.rating < 4);
  idea({ key: "moreRiders", icon: "users", href: "/logistics/couriers" }, f.riders === 1);
  return { peggy: urgentFirst(peggy), rex: rex.slice(0, MAX_IDEAS) };
}

/** Urgent items first, keeping the order above within each group. */
function urgentFirst(items: BriefItem[]) {
  return [...items.filter((item) => item.urgent), ...items.filter((item) => !item.urgent)];
}

/** A one-line summary of what needs doing, for the morning notification and the help chat ("3 things today"). */
export function briefSummary(items: BriefItem[]): { count: number; urgent: number } {
  return { count: items.length, urgent: items.filter((item) => item.urgent).length };
}
