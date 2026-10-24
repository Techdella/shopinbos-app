// Orders list filters past the three group chips (the web's /home/orders also has "Unpaid" and "To send", and a
// search by customer or item). No imports, so tests load it in Node.

export const ORDER_PAYS = ["any", "unpaid", "toSend"] as const;
export type OrderPay = (typeof ORDER_PAYS)[number];

export interface OrderFilters {
  q: string;
  pay: OrderPay;
}

export const NO_ORDER_FILTERS: OrderFilters = { q: "", pay: "any" };

const UNPAID = new Set(["pending", "awaiting_payment"]);
const TO_SEND = new Set(["paid", "processing", "packed"]);

/** Not paid yet, or paid and still to send; then every searched word in the customer, the items or the order number. */
export function filterOrders<O extends { status: string; buyer: string; summary: string; orderNumber?: string }>(orders: readonly O[], filters: OrderFilters): O[] {
  const words = filters.q.toLowerCase().replace(/#/g, "").split(/\s+/).filter(Boolean);
  return orders.filter((order) => {
    if (filters.pay === "unpaid" && !UNPAID.has(order.status)) return false;
    if (filters.pay === "toSend" && !TO_SEND.has(order.status)) return false;
    const haystack = `${order.buyer} ${order.summary} ${order.orderNumber ?? ""}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export const orderFilterCount = (filters: OrderFilters) => (filters.q.trim() ? 1 : 0) + (filters.pay !== "any" ? 1 : 0);
