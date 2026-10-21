import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { getChannel, sendReply } from "@/lib/inbox/service";
import { loadAutomation } from "@/lib/inbox/automation.server";
import { buildButtons, clip, interactiveSummary, LIMITS, withinServiceWindow, type WhatsAppInteractive } from "@/lib/inbox/whatsapp-bot";
import type { WhatsAppCartOrder } from "@/lib/inbox/pure";
import { createCustomerCartLink, paymentReadiness } from "@/lib/payment-links/service.server";
import { CUSTOMER_LINK_LIMITS } from "@/lib/payment-links/pure";
import { getCatalogRow } from "@/lib/whatsapp-catalog/server";
import { normalizeVariants } from "@shared/product-variants";
import { shopperStock, stockAvailability } from "@shared/product-stock";
import {
  addToCart,
  buildCartMessage,
  buildEditList,
  buildOptionList,
  buildPayMessage,
  cartFromCatalogOrder,
  confirmationText,
  confirmStage,
  KEEP_SHOPPING,
  lineKey,
  priceCart,
  readCart,
  removeOne,
  STORE_IDS,
  waMeLink,
  type CartLine,
  type SaleProduct,
  type StoreIntent,
} from "./pure";

// The WhatsApp store on the server: each customer's cart (WhatsAppCart, one per conversation), Peggy's replies to
// cart taps (priced from the database, never from the chat), the checkout link for the whole cart, the store's
// own Meta catalog with WhatsApp's native cart when it's synced, and the order confirmation sent back into the
// chat once the order is placed or paid. The orders are ordinary RetailOrders (channel "whatsapp"), so they show
// on the seller's Orders page with everything else.

export function moneyIn(currency: string) {
  return (amount: number) => {
    try {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
    }
  };
}

// ─── Products as the store sells them now ────────────────────────────────────

/** The store's published products by id, with prices, options and whether they can be bought today. */
export async function saleProducts(storeId: string, ids: string[]): Promise<Map<string, SaleProduct>> {
  const unique = [...new Set(ids)].slice(0, 50);
  if (!unique.length) return new Map();
  const rows = await db.storeProduct.findMany({
    where: { storeId, id: { in: unique }, status: "published" },
    select: { id: true, name: true, retailPrice: true, images: true, variants: true, trackStock: true, continueSellingWhenOut: true, currentStock: true, reservedStock: true, lowStockThreshold: true, fulfillmentType: true, supplierProduct: { select: { stockQuantity: true } } },
  });
  return new Map(
    rows.map((row) => {
      const dropship = row.fulfillmentType === "dropship" && Boolean(row.supplierProduct);
      const stock = dropship ? null : shopperStock(row);
      const supplierStock = dropship ? row.supplierProduct?.stockQuantity ?? null : null;
      const options = normalizeVariants(row.variants)
        .filter((variant) => variant.enabled)
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          price: variant.price,
          soldOut: !stockAvailability({ stock, supplierStock, variantStock: stock ? variant.stock : null }).canBuy,
        }));
      const soldOut = !stockAvailability({ stock, supplierStock }).canBuy && !options.some((option) => !option.soldOut);
      return [row.id, { id: row.id, name: row.name, price: Number(row.retailPrice) || 0, soldOut: options.length ? options.every((option) => option.soldOut) || soldOut : soldOut, options, imageUrl: row.images[0] ?? null }];
    }),
  );
}

// ─── The cart ────────────────────────────────────────────────────────────────

export async function loadCart(storeId: string, conversationId: string): Promise<CartLine[]> {
  const row = await db.whatsAppCart.findFirst({ where: { storeId, conversationId }, select: { items: true } });
  return readCart(row?.items);
}

async function saveCart(storeId: string, conversationId: string, phone: string, items: CartLine[], extra: { paymentLinkId?: string; checkedOutAt?: Date } = {}) {
  const json = items as unknown as Prisma.InputJsonValue;
  await db.whatsAppCart.upsert({
    where: { conversationId },
    create: { storeId, conversationId, phone, items: json, ...extra },
    update: { items: json, phone, ...extra },
  });
}

export interface StoreReply {
  body: string;
  interactive: WhatsAppInteractive | null;
  handoff: boolean;
  source: "cart" | "checkout";
}

const withSummary = (interactive: WhatsAppInteractive, source: StoreReply["source"] = "cart"): StoreReply => ({ body: interactiveSummary(interactive), interactive, handoff: false, source });

/**
 * Peggy's reply to a cart action, or to a cart sent from the WhatsApp catalog. Every product is the store's own
 * published one at today's price; the conversation's cart is the only one touched.
 */
export async function whatsappStoreAnswer(input: {
  storeId: string;
  conversationId: string;
  phone: string;
  contactName: string | null;
  currency: string;
  action: StoreIntent | { kind: "catalog_cart"; order: WhatsAppCartOrder };
}): Promise<StoreReply> {
  const { storeId, conversationId, phone, action } = input;
  const money = moneyIn(input.currency);
  let cart = await loadCart(storeId, conversationId);
  const priced = async (lines: CartLine[]) => priceCart(lines, await saleProducts(storeId, lines.map((line) => line.productId)));
  const cartReply = async (lines: CartLine[], intro?: string): Promise<StoreReply> => {
    const message = buildCartMessage(await priced(lines), money, intro);
    return { ...message, handoff: false, source: "cart" };
  };

  if (action.kind === "catalog_cart") {
    const products = await saleProducts(storeId, action.order.items.map((item) => item.productId));
    const known = action.order.items.filter((item) => products.has(item.productId));
    cart = cartFromCatalogOrder(known);
    await saveCart(storeId, conversationId, phone, cart);
    const missing = action.order.items.length - known.length;
    return cartReply(cart, `Got your cart, thank you!${missing > 0 ? " Some items are no longer available, so I left them out." : ""}`);
  }

  if (action.kind === "add") {
    const product = (await saleProducts(storeId, [action.productId])).get(action.productId);
    if (!product) {
      const body = "Sorry, that product isn't available any more.";
      return { body, interactive: buildButtons(body, [KEEP_SHOPPING, { id: STORE_IDS.cart, title: "View cart" }]), handoff: false, source: "cart" };
    }
    const option = action.variantId ? product.options.find((o) => o.id === action.variantId) ?? null : null;
    if (product.soldOut || option?.soldOut) {
      const body = `Sorry, ${option ? `${product.name} (${option.name})` : product.name} is sold out right now.`;
      const others = option ? buildOptionList(product, money) : null;
      if (others) return withSummary({ ...others, body: { text: `${body} ${others.body.text}`.slice(0, LIMITS.body) } });
      return { body, interactive: buildButtons(body, [KEEP_SHOPPING, { id: STORE_IDS.cart, title: "View cart" }]), handoff: false, source: "cart" };
    }
    // A size or colour first (a product with one option needs no choice).
    if (product.options.length > 1 && !option) {
      const list = buildOptionList(product, money);
      if (list) return withSummary(list);
    }
    const added = addToCart(cart, { productId: product.id, variantId: option?.id ?? null });
    if (!added.ok) {
      const body = added.reason === "full" ? "Your cart is full. Check out these items first, then start a new cart." : `That's the most of ${product.name} we can take in one order here.`;
      return cartReply(cart, body);
    }
    cart = added.cart;
    await saveCart(storeId, conversationId, phone, cart);
    return cartReply(cart, `Added ${option && product.options.length > 1 ? `${product.name} (${option.name})` : product.name} to your cart.`);
  }

  if (action.kind === "remove") {
    cart = removeOne(cart, action.key);
    await saveCart(storeId, conversationId, phone, cart);
    return cartReply(cart, "Done, I took one off.");
  }

  if (action.kind === "clear") {
    await saveCart(storeId, conversationId, phone, []);
    return cartReply([], "I've emptied your cart.");
  }

  if (action.kind === "edit") {
    const current = await priced(cart);
    if (!current.lines.length) return cartReply(cart);
    return withSummary(buildEditList(current, money));
  }

  if (action.kind === "cart") return cartReply(cart);

  // Checkout: drop what can't be bought, ask for any missing size or colour, then one link for the whole cart.
  const products = await saleProducts(storeId, cart.map((line) => line.productId));
  let current = priceCart(cart, products);
  const gone = current.lines.filter((line) => line.unavailable);
  if (gone.length) {
    const goneKeys = new Set(gone.map((line) => line.key));
    cart = cart.filter((line) => !goneKeys.has(lineKey(line)));
    current = priceCart(cart, products);
    await saveCart(storeId, conversationId, phone, cart);
  }
  if (!current.lines.length) return cartReply(cart, gone.length ? "Sorry, what was in your cart is no longer available." : undefined);
  if (gone.length) return cartReply(cart, `Sorry, ${gone.map((line) => line.name).join(", ")} ${gone.length === 1 ? "is" : "are"} no longer available, so I took ${gone.length === 1 ? "it" : "them"} out. Tap Checkout again to continue.`);
  const open = current.lines.find((line) => line.needsOption);
  if (open) {
    const product = products.get(open.productId);
    const list = product ? buildOptionList(product, money) : null;
    if (list) return withSummary({ ...list, body: { text: clip(`Before you pay: which option of ${product!.name} would you like?`, LIMITS.body) } });
  }

  const link = await createCustomerCartLink({
    storeId,
    conversationId,
    customerRef: phone,
    customerName: input.contactName,
    items: current.lines.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
  });
  if (!link.ok) {
    if (link.reason === "no_payment") return { body: "This shop can't take payment online yet, so someone from the shop will confirm your order, delivery and how to pay right here.", interactive: null, handoff: true, source: "checkout" };
    if (link.reason === "rate_limited" || link.reason === "store_busy") return { body: "You've started a few checkouts in the last hour, so someone from the shop will help you finish this order here.", interactive: null, handoff: true, source: "checkout" };
    return { body: "Sorry, I couldn't start your checkout. Someone from the shop will help you finish your order here.", interactive: null, handoff: true, source: "checkout" };
  }
  await saveCart(storeId, conversationId, phone, [], { paymentLinkId: link.linkId, checkedOutAt: new Date() });
  const message = buildPayMessage(current, money, link.url, { payOnDeliveryOnly: link.payOnDeliveryOnly, hours: CUSTOMER_LINK_LIMITS.expiryHours });
  return { ...message, handoff: false, source: "checkout" };
}

// ─── The store's Meta catalog (WhatsApp's own cart) ──────────────────────────

/**
 * When the store's products are synced to a Meta catalog linked to its WhatsApp number with the cart switched on:
 * a product_list message (up to 30 products, best sellers first) so customers browse and fill WhatsApp's own cart.
 * Null otherwise; Peggy then sends her own list and the in-chat cart.
 */
export async function catalogProductList(storeId: string, storeName: string): Promise<WhatsAppInteractive | null> {
  const row = await getCatalogRow(storeId).catch(() => null);
  if (!row?.catalogId || !row.wabaLinkedAt || !row.cartEnabled) return null;
  const synced = await db.whatsAppCatalogItem.findMany({ where: { storeId, catalogId: row.catalogId, status: "synced" }, select: { productId: true }, take: 500 });
  if (!synced.length) return null;
  const products = await db.storeProduct.findMany({
    where: { storeId, status: "published", id: { in: synced.map((item) => item.productId) } },
    orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
    take: 30,
    select: { id: true },
  });
  if (!products.length) return null;
  return {
    type: "product_list",
    header: { type: "text", text: clip(storeName, LIMITS.header) },
    body: { text: "Tap a product to see it, add what you like to your cart, then send the cart here. I'll send your checkout link." },
    footer: { text: "Prices and stock are from our store today." },
    action: { catalog_id: row.catalogId, sections: [{ title: "Products", product_items: products.map((p) => ({ product_retailer_id: p.id })) }] },
  };
}

// ─── Order confirmations in the chat ─────────────────────────────────────────

/**
 * Sends the order's confirmation into the WhatsApp chat it came from (a link Peggy made there): "placed" for bank
 * transfer and pay on delivery, "paid" once paid. Only inside WhatsApp's 24-hour window (outside it, the store's
 * approved order templates in Settings → Order messages still apply), once per order and stage, and only when the
 * seller left confirmations on. Never throws.
 */
export async function confirmWhatsAppOrder(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, orderNumber: true, status: true, paymentMethod: true, items: true, shippingFee: true, total: true, currency: true, paymentLinkId: true } });
    if (!order?.paymentLinkId) return;
    const stage = confirmStage(order);
    if (!stage) return;
    const link = await db.paymentLink.findFirst({ where: { id: order.paymentLinkId, storeId: order.storeId }, select: { conversationId: true, channel: true } });
    if (!link?.conversationId || link.channel !== "whatsapp") return;
    const [automation, conversation, store] = await Promise.all([
      loadAutomation(order.storeId),
      db.inboxConversation.findFirst({ where: { id: link.conversationId, storeId: order.storeId, channel: "whatsapp" }, select: { id: true, lastInboundAt: true } }),
      db.store.findUnique({ where: { id: order.storeId }, select: { slug: true, customDomain: true } }),
    ]);
    if (!automation.chatbot.whatsapp.confirmations || !conversation || !store || !withinServiceWindow(conversation.lastInboundAt)) return;
    const key = `${order.id}:${stage}`;
    const sent = await db.inboxMessage.findFirst({ where: { conversationId: conversation.id, direction: "outbound", status: { not: "failed" }, meta: { path: ["orderConfirmation"], equals: key } }, select: { id: true } });
    if (sent) return;
    const items = (Array.isArray(order.items) ? (order.items as Array<{ name?: unknown; quantity?: unknown; price?: unknown }>) : []).map((item) => ({ name: String(item.name ?? "Item"), quantity: Number(item.quantity) || 1, price: Number(item.price) || 0 }));
    const body = confirmationText(
      { stage, orderNumber: order.orderNumber, paymentMethod: order.paymentMethod, items, shippingFee: Number(order.shippingFee) || 0, total: Number(order.total) || 0, orderUrl: buildStorefrontUrl(store, `/order/${order.id}`) },
      moneyIn(order.currency),
    );
    await sendReply({ storeId: order.storeId, conversationId: conversation.id, kind: "auto_reply", authorName: "Order confirmation", body, meta: { orderConfirmation: key, orderId: order.id } });
  } catch (error) {
    console.error(`[whatsapp store] confirmation for order ${orderId} failed`, error);
  }
}

// ─── The seller's page ───────────────────────────────────────────────────────

export interface WhatsAppStoreView {
  connected: boolean;
  displayName: string | null;
  phone: string | null;
  /** The link the seller shares (wa.me with a ready message). */
  shareUrl: string | null;
  mode: "off" | "test" | "live";
  on: boolean;
  confirmations: boolean;
  payments: Awaited<ReturnType<typeof paymentReadiness>>;
  products: number;
  catalog: { synced: boolean; cart: boolean };
  stats: { orders: number; revenue: number; openCarts: number; currency: string };
  recentOrders: Array<{ id: string; orderNumber: string; buyerName: string; total: number; status: string; createdAt: string }>;
}

const PAID_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"] as const;

export async function whatsappStoreView(storeId: string): Promise<WhatsAppStoreView> {
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const [channel, automation, payments, products, catalog, orders, openCarts, store] = await Promise.all([
    getChannel(storeId, "whatsapp").catch(() => null),
    loadAutomation(storeId),
    paymentReadiness(storeId),
    db.storeProduct.count({ where: { storeId, status: "published" } }),
    getCatalogRow(storeId).catch(() => null),
    db.retailOrder.findMany({ where: { storeId, channel: "whatsapp", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, orderNumber: true, buyerName: true, total: true, status: true, createdAt: true } }),
    db.whatsAppCart.count({ where: { storeId, updatedAt: { gte: new Date(Date.now() - 7 * 24 * 3_600_000) }, NOT: { items: { equals: [] } } } }).catch(() => 0),
    db.store.findUnique({ where: { id: storeId }, select: { currency: true } }),
  ]);
  const settings = (channel?.row.settings ?? {}) as { phone?: unknown };
  const phone = typeof settings.phone === "string" && settings.phone ? settings.phone : null;
  const wa = automation.chatbot.whatsapp;
  const connected = channel?.row.status === "connected";
  return {
    connected,
    displayName: channel?.row.displayName ?? null,
    phone,
    shareUrl: connected ? waMeLink(phone) : null,
    mode: wa.mode,
    on: wa.mode !== "off" && wa.ordering === "cart",
    confirmations: wa.confirmations,
    payments,
    products,
    catalog: { synced: Boolean(catalog?.catalogId && catalog.wabaLinkedAt), cart: Boolean(catalog?.catalogId && catalog.wabaLinkedAt && catalog.cartEnabled) },
    stats: {
      orders: orders.length,
      revenue: orders.filter((order) => (PAID_STATUSES as readonly string[]).includes(order.status)).reduce((sum, order) => sum + Number(order.total), 0),
      openCarts,
      currency: store?.currency ?? "NGN",
    },
    recentOrders: orders.slice(0, 6).map((order) => ({ id: order.id, orderNumber: order.orderNumber, buyerName: order.buyerName, total: Number(order.total), status: order.status, createdAt: order.createdAt.toISOString() })),
  };
}
