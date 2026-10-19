// "Record a sale": a sale the seller made on WhatsApp, Instagram or in person, entered by hand.
// Shared by the web form, the mobile screen and the API so the options and totals match everywhere.

export const SALE_PAYMENTS = [
  { key: "transfer", label: "Bank transfer" },
  { key: "cash", label: "Cash" },
  { key: "pos", label: "POS or card" },
  { key: "unpaid", label: "Not paid yet" },
] as const;
export type SalePayment = (typeof SALE_PAYMENTS)[number]["key"];
export const SALE_PAYMENT_KEYS = ["transfer", "cash", "pos", "unpaid"] as const satisfies readonly SalePayment[];

export const SALE_DELIVERY = [
  { key: "collected", label: "Customer has it" },
  { key: "deliver", label: "I need to deliver it" },
] as const;
export type SaleDelivery = (typeof SALE_DELIVERY)[number]["key"];
export const SALE_DELIVERY_KEYS = ["collected", "deliver"] as const satisfies readonly SaleDelivery[];

/** How an offline payment is shown on an order. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  paystack: "Paystack",
  korapay: "Korapay",
  transfer: "Bank transfer",
  cash: "Cash",
  pos: "POS or card",
  pay_on_delivery: "Pay on delivery",
};

export interface SaleLine {
  productId?: string | null;
  name: string;
  price: number;
  quantity: number;
  image?: string | null;
}

export function saleTotals(lines: SaleLine[], deliveryFee = 0) {
  const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.price) * Math.max(0, Math.floor(line.quantity)), 0);
  const shippingFee = Math.max(0, deliveryFee);
  return { subtotal, shippingFee, total: subtotal + shippingFee };
}

/**
 * Order status for a recorded sale. Paid and already with the customer is done ("delivered");
 * paid but still to deliver waits for a rider ("paid"); unpaid waits for payment ("pending").
 */
export function saleStatus(payment: SalePayment, delivery: SaleDelivery) {
  if (payment === "unpaid") {
    return { status: "pending" as const, paymentMethod: delivery === "deliver" ? "pay_on_delivery" : null, delivered: false };
  }
  return { status: delivery === "collected" ? ("delivered" as const) : ("paid" as const), paymentMethod: payment, delivered: delivery === "collected" };
}

/** Status after the seller marks an unpaid recorded sale as paid. */
export function statusWhenMarkedPaid(logisticsDetails: unknown): "delivered" | "paid" {
  const type = logisticsDetails && typeof logisticsDetails === "object" ? (logisticsDetails as Record<string, unknown>).type : null;
  return type === "collected" ? "delivered" : "paid";
}
