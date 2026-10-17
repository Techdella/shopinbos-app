// Pure calculations for the seller home dashboard (web /home and the mobile app). No server imports,
// so they are unit-tested in tests/behaviour.test.mjs.

import { computeSellerInsights, PAID_ORDER_STATUSES } from "../insights.ts";
import { CHANNEL_LABEL, ORDER_CHANNELS, type OrderChannel } from "../../../shared/channels.ts";

export interface DashboardOrder {
  id: string;
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  items: unknown;
  total: number;
  status: string;
  createdAt: Date;
  channel: string | null;
  deliveryAddress: unknown;
  logisticsDetails: unknown;
}

export interface DashboardProduct {
  id: string;
  name: string;
  images: string[];
  retailPrice: number;
  currentStock: number;
  lowStockThreshold: number;
  soldStock: number;
  /** false: the seller doesn't track this product's stock (never low or sold out). */
  trackStock?: boolean;
}

export type Tone = "accent" | "success" | "warning" | "muted" | "danger";

export interface OrderRow {
  id: string;
  orderNumber: string;
  buyer: string;
  summary: string;
  image: string | null;
  stage: { label: string; tone: Tone };
  payment: { label: string; tone: Tone };
  total: number;
}

const PAID = new Set<string>(PAID_ORDER_STATUSES);
const DAY = 86_400_000;
const LAGOS_OFFSET = 3_600_000; // West Africa Time, UTC+1, no daylight saving.

/** Midnight in Lagos for the day containing `now`, as a UTC instant. */
export function startOfLagosDay(now: Date) {
  const local = new Date(now.getTime() + LAGOS_OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - LAGOS_OFFSET);
}

function firstItem(items: unknown): { name: string; quantity: number; image: string | null; count: number } | null {
  const list = Array.isArray(items) ? items.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
  if (!list.length) return null;
  const item = list[0];
  return {
    name: String(item.name ?? item.title ?? "Item"),
    quantity: Number(item.quantity ?? 1) || 1,
    image: typeof item.image === "string" ? item.image : null,
    count: list.length,
  };
}

function hasDeliveryArranged(order: DashboardOrder) {
  const details = order.logisticsDetails;
  return Boolean(details && typeof details === "object" && !Array.isArray(details) && (details as Record<string, unknown>).type);
}

/** What the seller should know about an order at a glance, in the words of the mockup. */
export function orderStage(order: DashboardOrder): { label: string; tone: Tone } {
  switch (order.status) {
    case "pending":
    case "awaiting_payment":
      return { label: "Waiting for payment", tone: "warning" };
    case "paid":
    case "processing":
    case "packed":
      return hasDeliveryArranged(order) ? { label: "Ready to go out", tone: "accent" } : { label: "Needs a rider", tone: "accent" };
    case "shipped":
      return { label: "On the way", tone: "success" };
    case "delivered":
      return { label: "Delivered", tone: "success" };
    case "returned":
      return { label: "Returned", tone: "muted" };
    case "refunded":
    case "partially_refunded":
      return { label: "Refunded", tone: "muted" };
    case "cancelled":
      return { label: "Cancelled", tone: "danger" };
    default:
      return { label: order.status, tone: "muted" };
  }
}

export function paymentState(order: DashboardOrder): { label: string; tone: Tone } {
  if (PAID.has(order.status)) return { label: "Paid", tone: "success" };
  if (order.status === "pending" || order.status === "awaiting_payment") return { label: "Not paid yet", tone: "warning" };
  if (order.status === "refunded" || order.status === "partially_refunded") return { label: "Refunded", tone: "muted" };
  return { label: "Unpaid", tone: "muted" };
}

export function orderRow(order: DashboardOrder): OrderRow {
  const item = firstItem(order.items);
  const summary = item ? `${item.name}${item.quantity > 1 ? ` × ${item.quantity}` : ""}${item.count > 1 ? ` + ${item.count - 1} more` : ""}` : "Order";
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    buyer: order.buyerName,
    summary,
    image: item?.image ?? null,
    stage: orderStage(order),
    payment: paymentState(order),
    total: Number(order.total) || 0,
  };
}

export function stockLabel(product: DashboardProduct): { label: string; low: boolean } {
  if (product.trackStock === false) return { label: "Stock not tracked", low: false };
  if (product.currentStock <= 0) return { label: "Sold out", low: true };
  const low = product.currentStock <= product.lowStockThreshold;
  return { label: low ? `${product.currentStock} left` : `${product.currentStock} in stock`, low };
}

export interface DashboardInput {
  orders: DashboardOrder[];
  products: DashboardProduct[];
  now?: Date;
}

export function computeDashboard({ orders, products, now = new Date() }: DashboardInput) {
  const today = startOfLagosDay(now).getTime();
  const weekStart = today - 6 * DAY;
  const lastWeekStart = weekStart - 7 * DAY;
  const paid = orders.filter((order) => PAID.has(order.status));
  const sum = (from: number, to: number) => paid.filter((o) => o.createdAt.getTime() >= from && o.createdAt.getTime() < to).reduce((total, o) => total + (Number(o.total) || 0), 0);

  const todaySales = sum(today, today + DAY);
  const weekSales = sum(weekStart, today + DAY);
  const lastWeekSales = sum(lastWeekStart, weekStart);
  const weekChange = lastWeekSales > 0 ? Math.round(((weekSales - lastWeekSales) / lastWeekSales) * 100) : null;
  const ordersToday = orders.filter((o) => o.createdAt.getTime() >= today && o.status !== "cancelled").length;

  const insights = computeSellerInsights(
    orders.map((o) => ({ total: o.total, status: o.status, createdAt: o.createdAt, buyerEmail: o.buyerEmail, deliveryAddress: o.deliveryAddress, items: o.items })),
    now,
    14,
  );

  const toSend = orders.filter((o) => o.status === "paid" || o.status === "processing" || o.status === "packed");
  const awaitingPayment = orders.filter((o) => o.status === "awaiting_payment" || o.status === "pending");

  // Last 30 days, recorded channels only (orders placed before channel tracking have none).
  const sourceCounts = new Map<OrderChannel, number>();
  for (const order of orders) {
    if (order.createdAt.getTime() < today - 29 * DAY || order.status === "cancelled") continue;
    const channel = (ORDER_CHANNELS as readonly string[]).includes(order.channel ?? "") ? (order.channel as OrderChannel) : null;
    if (channel) sourceCounts.set(channel, (sourceCounts.get(channel) ?? 0) + 1);
  }
  const sourceMax = Math.max(1, ...sourceCounts.values());
  const sources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([channel, count]) => ({ channel, label: CHANNEL_LABEL[channel], count, share: count / sourceMax }));

  const sellingFast = [...products]
    .filter((p) => p.soldStock > 0)
    .sort((a, b) => b.soldStock - a.soldStock)
    .slice(0, 6)
    .map((p) => ({ id: p.id, name: p.name, image: p.images[0] ?? null, price: p.retailPrice, sold: p.soldStock, stock: stockLabel(p) }));
  const lowStock = products
    .filter((p) => p.trackStock !== false && p.currentStock <= p.lowStockThreshold)
    .sort((a, b) => b.soldStock - a.soldStock || a.currentStock - b.currentStock);

  return {
    todaySales,
    weekSales,
    weekChange,
    ordersToday,
    daily: insights.daily,
    latestOrders: [...orders].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 8).map(orderRow),
    ordersToSend: toSend.length,
    ordersAwaitingPayment: awaitingPayment.length,
    sources,
    sellingFast,
    lowStock: lowStock.slice(0, 3).map((p) => ({ id: p.id, name: p.name, image: p.images[0] ?? null, stock: p.currentStock })),
  };
}

export type DashboardNumbers = ReturnType<typeof computeDashboard>;
