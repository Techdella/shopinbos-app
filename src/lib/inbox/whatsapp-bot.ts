// Peggy on WhatsApp, the pure parts: the 24-hour customer service window, what a customer message asks for
// (products, an order, order status, a person), the WhatsApp interactive list and button payloads within
// Meta's limits, the text we log in the inbox for them, and whether Peggy may answer at all. No server
// imports; unit-tested in tests/whatsapp-bot.test.mjs. The server side is in ./chatbot.server.ts (answers)
// and ./service.ts (gating, sending, hand-off).

import { wantsHuman, type WhatsAppBotSettings } from "./assistant.ts";

// ─── The 24-hour customer service window ─────────────────────────────────────

/** Free-form messages (text, lists, buttons, media) only reach a customer within 24h of their last message. */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export function withinServiceWindow(lastInboundAt: Date | string | null | undefined, now = new Date()) {
  if (!lastInboundAt) return false;
  const at = new Date(lastInboundAt).getTime();
  return Number.isFinite(at) && now.getTime() - at < WHATSAPP_WINDOW_MS && at - now.getTime() < 5 * 60_000;
}

export function windowClosesAt(lastInboundAt: Date | string | null | undefined): Date | null {
  if (!lastInboundAt) return null;
  const at = new Date(lastInboundAt).getTime();
  return Number.isFinite(at) ? new Date(at + WHATSAPP_WINDOW_MS) : null;
}

export const WINDOW_CLOSED_ERROR =
  "It's been over 24 hours since this customer last messaged, so WhatsApp only allows an approved message template now. Set one up in WhatsApp Manager → Message templates, or wait for them to message you again.";

// ─── What the customer wants ─────────────────────────────────────────────────

/** Short words that mean "a person, please" on WhatsApp, on top of the shared phrases and the seller's own. */
export const WHATSAPP_HANDOFF_WORDS = ["agent", "person", "human", "representative", "customer care", "speak to someone"];

const flat = (value: string) => ` ${value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
const hasAny = (message: string, phrases: string[]) => {
  const haystack = flat(message);
  return phrases.some((phrase) => haystack.includes(flat(phrase)));
};

export function wantsHumanOnWhatsApp(message: string, extra: string[] = []) {
  return wantsHuman(message, [...WHATSAPP_HANDOFF_WORDS, ...extra]);
}

const CATALOGUE = ["what do you sell", "see your products", "like to shop", "what do you have", "what you sell", "what you have", "what s available", "whats available", "catalogue", "catalog", "menu", "price list", "pricelist", "see products", "all products", "list of products", "show me products", "show me what", "your items", "wetin you get", "wetin una dey sell", "wetin una get"];
const ORDER_STATUS = ["my order", "order status", "where is my order", "track my", "tracking", "has my order", "delivered yet", "my package", "my delivery", "when will i get", "when will my"];
const GREETINGS = ["hi", "hello", "hey", "hiya", "good morning", "good afternoon", "good evening", "morning", "evening", "how far", "hello there", "hi there", "start"];

/** Button and list-row ids Peggy sends, so a tap comes back as an exact intent instead of free text. */
export const REPLY_IDS = { menu: "menu", human: "human", status: "status", product: "p:", order: "o:" } as const;

export type WhatsAppIntent =
  | { kind: "handoff" }
  | { kind: "catalogue" }
  | { kind: "product"; productId: string }
  | { kind: "order"; productId: string }
  | { kind: "order_status" }
  | { kind: "greeting" }
  | { kind: "question" };

const productIdFrom = (value: string) => (/^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null);

/**
 * The customer's intent. A tapped button or list row (replyId) wins; then "a person" words; then the switched-on
 * features (product list, order status); then a bare greeting; anything else is a question for the AI.
 */
export function detectWhatsAppIntent(input: {
  text: string;
  replyId?: string | null;
  handoffKeywords?: string[];
  features: Pick<WhatsAppBotSettings, "productList" | "orderStatus" | "ordering">;
}): WhatsAppIntent {
  const id = (input.replyId ?? "").trim();
  if (id === REPLY_IDS.human) return { kind: "handoff" };
  if (id === REPLY_IDS.menu && input.features.productList) return { kind: "catalogue" };
  if (id === REPLY_IDS.status && input.features.orderStatus) return { kind: "order_status" };
  if (id.startsWith(REPLY_IDS.product)) {
    const productId = productIdFrom(id.slice(REPLY_IDS.product.length));
    if (productId) return { kind: "product", productId };
  }
  if (id.startsWith(REPLY_IDS.order) && input.features.ordering !== "off") {
    const productId = productIdFrom(id.slice(REPLY_IDS.order.length));
    if (productId) return { kind: "order", productId };
  }

  const text = input.text.slice(0, 1200);
  if (wantsHumanOnWhatsApp(text, input.handoffKeywords ?? [])) return { kind: "handoff" };
  if (input.features.orderStatus && hasAny(text, ORDER_STATUS)) return { kind: "order_status" };
  if (input.features.productList && hasAny(text, CATALOGUE)) return { kind: "catalogue" };
  const bare = flat(text).trim();
  if (bare && GREETINGS.includes(bare)) return { kind: "greeting" };
  return { kind: "question" };
}

// ─── Interactive messages (Meta's limits) ────────────────────────────────────

export const LIMITS = { rows: 10, rowTitle: 24, rowDescription: 72, rowId: 200, listButton: 20, header: 60, footer: 60, body: 1024, buttons: 3, buttonTitle: 20, sectionTitle: 24 } as const;

/** The `interactive` object of a WhatsApp Cloud API message (list or reply buttons). */
export type WhatsAppInteractive =
  | {
      type: "list";
      header?: { type: "text"; text: string };
      body: { text: string };
      footer?: { text: string };
      action: { button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };
    }
  | {
      type: "button";
      header?: { type: "text"; text: string } | { type: "image"; image: { link: string } };
      body: { text: string };
      footer?: { text: string };
      action: { buttons: Array<{ type: "reply"; reply: { id: string; title: string } }> };
    }
  | {
      /** One button that opens a link (the WhatsApp store's "Pay now"). */
      type: "cta_url";
      header?: { type: "text"; text: string };
      body: { text: string };
      footer?: { text: string };
      action: { name: "cta_url"; parameters: { display_text: string; url: string } };
    }
  | {
      /** Products from the store's synced Meta catalog, with WhatsApp's own cart (src/lib/whatsapp-catalog). */
      type: "product_list";
      header: { type: "text"; text: string };
      body: { text: string };
      footer?: { text: string };
      action: { catalog_id: string; sections: Array<{ title: string; product_items: Array<{ product_retailer_id: string }> }> };
    };

/** Cut to Meta's length, ending with an ellipsis when something was cut. */
export function clip(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export interface ListProduct {
  id: string;
  name: string;
  /** Already formatted ("₦12,500"). */
  price: string;
  inStock: boolean;
}

/** "What do you sell?" → a list of up to 10 products (in stock first) with prices. Null when there are none. */
export function buildProductList(products: ListProduct[], opts: { storeName: string; total?: number }): WhatsAppInteractive | null {
  const picked = [...products.filter((p) => p.inStock), ...products.filter((p) => !p.inStock)].slice(0, LIMITS.rows);
  if (!picked.length) return null;
  const total = Math.max(opts.total ?? products.length, picked.length);
  const body = total > picked.length
    ? `Here are ${picked.length} of our ${total} products. Tap one for details, or type the name of what you're looking for.`
    : "Here's what we have. Tap a product for details and how to order.";
  return {
    type: "list",
    header: { type: "text", text: clip(opts.storeName, LIMITS.header) },
    body: { text: body },
    footer: { text: clip("Prices and stock are from our store today.", LIMITS.footer) },
    action: {
      button: "See products",
      sections: [
        {
          title: "Products",
          rows: picked.map((p) => ({ id: `${REPLY_IDS.product}${p.id}`.slice(0, LIMITS.rowId), title: clip(p.name, LIMITS.rowTitle), description: clip(`${p.price} · ${p.inStock ? "In stock" : "Out of stock"}`, LIMITS.rowDescription) })),
        },
      ],
    },
  };
}

export interface ReplyButton {
  id: string;
  title: string;
}

/** Up to three reply buttons under a message, optionally with a product photo (https only) on top. */
export function buildButtons(body: string, buttons: ReplyButton[], extra: { imageUrl?: string | null; footer?: string | null } = {}): WhatsAppInteractive {
  const seen = new Set<string>();
  const list = buttons
    .map((b) => ({ id: b.id.slice(0, 256), title: clip(b.title, LIMITS.buttonTitle) }))
    .filter((b) => b.id && b.title && !seen.has(b.title.toLowerCase()) && seen.add(b.title.toLowerCase()))
    .slice(0, LIMITS.buttons);
  const image = extra.imageUrl && /^https:\/\/\S+$/i.test(extra.imageUrl) ? extra.imageUrl : null;
  return {
    type: "button",
    ...(image ? { header: { type: "image" as const, image: { link: image } } } : {}),
    body: { text: body.slice(0, LIMITS.body) },
    ...(extra.footer ? { footer: { text: clip(extra.footer, LIMITS.footer) } } : {}),
    action: { buttons: list.map((b) => ({ type: "reply" as const, reply: b })) },
  };
}

/** How an interactive message reads in the seller's inbox (and the plain-text fallback). */
export function interactiveSummary(interactive: WhatsAppInteractive) {
  const lines = [interactive.body.text];
  if (interactive.type === "list") {
    for (const section of interactive.action.sections) for (const row of section.rows) lines.push(`• ${row.title}${row.description ? ` (${row.description})` : ""}`);
    lines.push(`[List button: ${interactive.action.button}]`);
  } else if (interactive.type === "button") {
    lines.push(interactive.action.buttons.map((b) => `[${b.reply.title}]`).join(" "));
  } else if (interactive.type === "cta_url") {
    lines.push(`[${interactive.action.parameters.display_text}: ${interactive.action.parameters.url}]`);
  } else {
    const count = interactive.action.sections.reduce((sum, section) => sum + section.product_items.length, 0);
    lines.push(`[Catalog: ${count} product${count === 1 ? "" : "s"}, with the WhatsApp cart]`);
  }
  return lines.filter(Boolean).join("\n");
}

// ─── Order status ────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<string, string> = {
  pending: "received, waiting for payment",
  awaiting_payment: "waiting for payment",
  paid: "paid, being prepared",
  processing: "being prepared",
  packed: "packed, ready to send",
  shipped: "on its way",
  delivered: "delivered",
  returned: "returned",
  cancelled: "cancelled",
  refunded: "refunded",
  partially_refunded: "partly refunded",
};

export interface OrderLine {
  orderNumber: string;
  status: string;
  total: string;
  createdAt: Date;
  trackingCode?: string | null;
}

/** The customer's own recent orders (matched by their WhatsApp number on the server), in plain words. */
export function describeOrders(orders: OrderLine[]) {
  if (!orders.length) {
    return "I couldn't find an order placed with this WhatsApp number. If you used a different number or ordered another way, send your order number and someone from the shop will check for you.";
  }
  const date = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(d);
  const lines = orders.slice(0, 3).map((o) => `Order ${o.orderNumber} (${date(o.createdAt)}, ${o.total}): ${STATUS_TEXT[o.status] ?? o.status}${o.trackingCode ? `. Tracking: ${o.trackingCode}` : ""}.`);
  return `${orders.length === 1 ? "Here's your latest order" : "Here are your latest orders"}:\n${lines.join("\n")}`;
}

// ─── May Peggy answer? ───────────────────────────────────────────────────────

/** Per conversation and per store, so a loop or a flood can't run up messages (Meta also limits ~1 msg / 6s per user). */
export const WA_BOT_REPLIES_PER_HOUR = 20;
export const WA_BOT_STORE_REPLIES_PER_HOUR = 300;

/** Same number, ignoring the + and any leading country-code differences (last 10 digits). */
export function samePhone(a: string | null | undefined, b: string | null | undefined) {
  const da = (a ?? "").replace(/\D/g, "");
  const db = (b ?? "").replace(/\D/g, "");
  return da.length >= 7 && db.length >= 7 && da.slice(-10) === db.slice(-10);
}

export interface WhatsAppGateInput {
  settings: Pick<WhatsAppBotSettings, "mode" | "testNumber" | "quietMinutes">;
  /** The customer's number (the conversation's thread id). */
  from: string;
  /** The conversation was handed to a person ("needs-human" tag). */
  handedOff: boolean;
  /** In Peggy's WhatsApp hours. */
  onDuty: boolean;
  lastInboundAt: Date | string | null | undefined;
  /** The seller's latest hand-written reply on this conversation. */
  sellerRepliedAt: Date | string | null | undefined;
  botRepliesLastHour: number;
  storeBotRepliesLastHour: number;
  now?: Date;
}

export type WhatsAppGate = { answer: true; test: boolean } | { answer: false; reason: "off" | "not_test_number" | "handed_off" | "off_duty" | "seller_replying" | "window_closed" | "rate_limited" };

export function whatsAppBotGate(input: WhatsAppGateInput): WhatsAppGate {
  const now = input.now ?? new Date();
  const { mode } = input.settings;
  if (mode === "off") return { answer: false, reason: "off" };
  const test = mode === "test";
  if (test && !samePhone(input.from, input.settings.testNumber)) return { answer: false, reason: "not_test_number" };
  if (input.handedOff) return { answer: false, reason: "handed_off" };
  // Test mode answers the seller's own number at any hour, so they can try it.
  if (!test && !input.onDuty) return { answer: false, reason: "off_duty" };
  if (input.sellerRepliedAt && now.getTime() - new Date(input.sellerRepliedAt).getTime() < input.settings.quietMinutes * 60_000) return { answer: false, reason: "seller_replying" };
  if (!withinServiceWindow(input.lastInboundAt, now)) return { answer: false, reason: "window_closed" };
  if (input.botRepliesLastHour >= WA_BOT_REPLIES_PER_HOUR || input.storeBotRepliesLastHour >= WA_BOT_STORE_REPLIES_PER_HOUR) return { answer: false, reason: "rate_limited" };
  return { answer: true, test };
}

// ─── Prompt-injection hygiene ────────────────────────────────────────────────

/**
 * Customer text as it goes to the model: control characters and our own section markers removed, length capped.
 * The system prompt also says customer text is data, never instructions.
 */
export function customerTextForModel(text: string, max = 1200) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/<\/?(shop_facts|rules|system|instructions)>/gi, "")
    .slice(0, max);
}
