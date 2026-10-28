// Trust lines on a store's product page (spec gap C8): "Verified supplier", "Verified delivery" and "Paid-at-checkout
// protection", each shown only when it's true. Dropship stays blind: the line never names the supplier or the delivery
// company (the shopper only ever sees the seller's shop). Worked out on the server
// (src/lib/storefront/product-page.server.ts) so only these booleans reach the page. Pure, unit-tested in
// tests/dropship-marketplace.test.mjs.

export interface StorefrontTrust {
  /** A dropship product from a supplier Shopinbos verified (business documents checked). */
  verifiedSupplier: boolean;
  /** Delivered by Shopinbos-verified delivery partners booked at checkout. */
  verifiedDelivery: boolean;
  /** The shopper pays by card or bank in the store's checkout (recorded with the order), not to a private account. */
  paidAtCheckout: boolean;
}

export function storefrontTrust(input: {
  dropship: boolean;
  supplierVerificationStatus?: string | null;
  /** The seller's checkout books delivery partners (DeliverySettings.checkoutMode "partners": verified partners only). */
  partnerDelivery: boolean;
  /** The store takes card or bank payments at checkout (Paystack or Korapay ready for this store). */
  onlinePayments: boolean;
}): StorefrontTrust {
  return {
    verifiedSupplier: input.dropship && input.supplierVerificationStatus === "verified",
    verifiedDelivery: input.partnerDelivery,
    paidAtCheckout: input.onlinePayments,
  };
}

export function hasTrustLines(trust: StorefrontTrust | null | undefined): boolean {
  return Boolean(trust && (trust.verifiedSupplier || trust.verifiedDelivery || trust.paidAtCheckout));
}

/** The lines in order, for the page (English; the storefront is in the seller's own words). */
export function trustLines(trust: StorefrontTrust | null | undefined): Array<{ key: keyof StorefrontTrust; title: string; detail: string }> {
  if (!trust) return [];
  const lines: Array<{ key: keyof StorefrontTrust; title: string; detail: string }> = [];
  if (trust.verifiedSupplier) lines.push({ key: "verifiedSupplier", title: "Verified supplier", detail: "Made or stocked by a business Shopinbos has checked." });
  if (trust.verifiedDelivery) lines.push({ key: "verifiedDelivery", title: "Verified delivery", detail: "Sent with a checked delivery partner you can track." });
  if (trust.paidAtCheckout) lines.push({ key: "paidAtCheckout", title: "Paid-at-checkout protection", detail: "Pay securely by card or bank at checkout. Your payment is recorded with your order." });
  return lines;
}
