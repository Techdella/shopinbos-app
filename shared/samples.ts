// Samples (spec gap C6a): a seller can order ONE piece of a supplier's product at the dropship price to try it
// before selling it, when the supplier offers samples (SupplierProduct.sampleAvailable). It goes through the usual
// wholesale order and card payment (src/lib/supplier-orders/wholesale.server.ts), quantity 1, flagged `sample`; the
// supplier sees it labelled "Sample". One per seller per product: WholesaleOrder.sampleKey is unique while the
// sample is live, and a sample the supplier declined (or that was cancelled) can be ordered again. Pure, unit-tested
// in tests/dropship-marketplace.test.mjs.

export const SAMPLE_QUANTITY = 1;

/** Wholesale statuses that free the seller to order another sample (declined, cancelled or refunded). */
export const SAMPLE_RETRY_STATUSES = ["cancelled", "refunded"] as const;

/** The unique key of a live sample: one per seller per product. */
export function sampleKey(sellerId: string, supplierProductId: string): string {
  return `${sellerId}:${supplierProductId}`;
}

/** True when this earlier sample still counts (anything but declined, cancelled or refunded). */
export function sampleStillCounts(status: string): boolean {
  return !(SAMPLE_RETRY_STATUSES as readonly string[]).includes(status);
}

/** Why this seller can't order a sample of this product now, or null. */
export function sampleProblem(input: {
  sampleAvailable: boolean | null | undefined;
  ownProduct?: boolean;
  stock?: number | null;
  /** The seller's earlier samples of this product (their statuses). */
  previous: ReadonlyArray<{ status: string }>;
}): string | null {
  if (!input.sampleAvailable) return "This supplier doesn't send samples of this product.";
  if (input.ownProduct) return "You can't order a sample of your own product.";
  if (input.previous.some((order) => sampleStillCounts(order.status))) return "You already ordered a sample of this product. It's in your wholesale orders.";
  if (typeof input.stock === "number" && input.stock < SAMPLE_QUANTITY) return "The supplier is out of stock right now.";
  return null;
}

/** What the seller sees on the product before ordering: whether they can, and what the earlier sample is doing. */
export interface SampleOffer {
  /** The dropship price: what the one piece costs (delivery is agreed with the supplier, like any wholesale order). */
  price: number;
  /** The seller's live sample of it, if any (its wholesale order). */
  ordered: { id: string; status: string } | null;
}

export function sampleOfferFor(input: { sampleAvailable: boolean | null | undefined; price: number; previous: ReadonlyArray<{ id: string; status: string }> }): SampleOffer | null {
  if (!input.sampleAvailable || !(input.price > 0)) return null;
  const live = input.previous.find((order) => sampleStillCounts(order.status)) ?? null;
  return { price: input.price, ordered: live ? { id: live.id, status: live.status } : null };
}
