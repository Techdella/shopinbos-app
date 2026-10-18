// Paystack split at checkout: who gets what from one online store order. Pure, so tests load it directly; the
// database side is payment-split.server.ts.
//
// The seller's share goes straight to their Paystack subaccount (their payout bank, settled by Paystack); the rest
// stays in Shopinbos's balance:
//   * Shopinbos's fee (PlatformFeeConfig: rate %, with optional min / max per order)
//   * dropship suppliers' cost (paid to them once they ship; a supplier can be switched or the order refunded first)
//   * the delivery fee, when a Shopinbos delivery partner carries it (orders with dropship items)
//   * an affiliate's commission
// Paystack's own charge comes out of the seller's share (bearer "subaccount").
//
// Refunds: Paystack takes a refund from Shopinbos's balance, but the seller's share has usually settled already.
// So a refunded split order puts that share on the seller's balance (what they owe), and the next online orders take
// it back from the seller's share until it's cleared. A negative balance (we took back too much) is paid back the
// same way. Amounts are naira; Paystack wants kobo (toKobo).

export interface FeeConfig {
  rate: number; // percent
  minFee: number;
  maxFee: number; // 0 = no max
}

export const DEFAULT_FEE: FeeConfig = { rate: 1.5, minFee: 0, maxFee: 0 };

export interface SplitInput {
  total: number;
  shippingFee: number;
  /** Sum of dropship suppliers' costs (wholesale price × quantity). */
  supplierCost: number;
  /** The order has dropship items, so a Shopinbos delivery partner carries it and the delivery fee is theirs. */
  partnerDelivery: boolean;
  affiliateCommission: number;
  /** What the seller owes Shopinbos now (positive), or is owed (negative), from earlier refunds. */
  balance: number;
  fee: FeeConfig;
}

export interface SplitPlan {
  /** Goes to the seller's subaccount (before Paystack's charge, which the seller bears). */
  sellerShare: number;
  /** Stays in Shopinbos's balance: Paystack's transaction_charge. */
  platformShare: number;
  fee: number;
  supplierCost: number;
  deliveryHeld: number;
  affiliate: number;
  /** Taken back from (positive) or paid back to (negative) the seller's balance by this order. */
  balanceApplied: number;
}

/** Paystack charges at least this much; a share smaller than this can't settle, so tiny shares don't split. */
export const MIN_SELLER_SHARE = 100;

const naira = (value: number) => Math.round(value * 100) / 100;

export function platformFee(amount: number, fee: FeeConfig) {
  if (!(amount > 0) || !(fee.rate >= 0)) return 0;
  let value = (amount * fee.rate) / 100;
  if (fee.minFee > 0) value = Math.max(value, fee.minFee);
  if (fee.maxFee > 0) value = Math.min(value, fee.maxFee);
  return naira(Math.min(value, amount));
}

/** null when nothing can go to the seller (all of it is owed elsewhere): the order is then not split. */
export function planSplit(input: SplitInput): SplitPlan | null {
  const total = naira(Math.max(0, input.total));
  const deliveryHeld = input.partnerDelivery ? naira(Math.max(0, Math.min(input.shippingFee, total))) : 0;
  // The fee is on what the seller sells, not on delivery a partner keeps.
  const fee = platformFee(total - deliveryHeld, input.fee);
  const supplierCost = naira(Math.max(0, input.supplierCost));
  const affiliate = naira(Math.max(0, input.affiliateCommission));
  const before = naira(total - deliveryHeld - fee - supplierCost - affiliate);
  if (before < MIN_SELLER_SHARE) return null;

  // Take back what they owe, leaving them at least the minimum; pay back what they're owed out of our part.
  const balance = naira(input.balance);
  const ours = naira(total - before);
  const balanceApplied = balance > 0 ? naira(Math.min(balance, before - MIN_SELLER_SHARE)) : naira(-Math.min(-balance, ours));
  const sellerShare = naira(before - balanceApplied);
  return { sellerShare, platformShare: naira(total - sellerShare), fee, supplierCost, deliveryHeld, affiliate, balanceApplied };
}

export const toKobo = (amount: number) => Math.round(amount * 100);

/**
 * What a refunded split order adds to the seller's balance: the share they received, plus what the order took back
 * from their balance (that went back to the buyer in the refund too). Equal to the share before the balance.
 */
export function refundDebt(plan: Pick<SplitPlan, "sellerShare" | "balanceApplied">) {
  return naira(plan.sellerShare + plan.balanceApplied);
}

/** The split stored on the order (RetailOrder.paymentSplit). */
export type StoredSplit =
  | ({ mode: "split"; subaccount: string } & SplitPlan)
  | { mode: "held"; reason: "disabled" | "no_subaccount" | "nothing_to_seller" | "error" };

export function readStoredSplit(value: unknown): StoredSplit | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.mode === "split" && typeof record.subaccount === "string" && typeof record.sellerShare === "number") return record as unknown as StoredSplit;
  if (record.mode === "held") return record as unknown as StoredSplit;
  return null;
}
