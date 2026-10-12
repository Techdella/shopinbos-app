// Checks a Paystack charge.success event against the storefront order it names (reference = order id) before
// the order is marked paid. The buyer's browser sets the amount for inline payments, so a signed event only
// proves money moved; it does not prove the right amount moved. Pure so tests can exercise it.

export const PAYABLE_ORDER_STATUSES = ["pending", "awaiting_payment"] as const;

export interface PaystackChargeData {
  reference?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
}

export interface PayableOrder {
  id: string;
  total: number | string | { toString(): string };
  currency: string;
  status: string;
}

/** Why this charge must not mark the order paid, or null when it may. */
export function retailChargeProblem(order: PayableOrder | null, charge: PaystackChargeData): string | null {
  if (!order) return "order not found";
  if (charge.reference !== order.id) return "reference does not match the order";
  if (charge.status !== undefined && charge.status !== "success") return "charge did not succeed";
  if (!(PAYABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) return "order is not awaiting payment";
  const amountKobo = typeof charge.amount === "number" ? charge.amount : Number(charge.amount);
  if (!Number.isFinite(amountKobo)) return "charge has no amount";
  if (Math.round(amountKobo) < Math.round(Number(order.total) * 100)) return "charge is less than the order total";
  if (typeof charge.currency === "string" && charge.currency.toUpperCase() !== order.currency.toUpperCase()) {
    return "charge currency does not match the order";
  }
  return null;
}
