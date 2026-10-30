// The WhatsApp store, the pure parts: a customer's cart inside the chat (add, take one off, empty), what a tap or
// a typed word asks of it, the cart priced from the store's products, the WhatsApp messages for it within Meta's
// limits (cart, option picker, "Pay now"), a cart sent from WhatsApp's own catalog cart, the shareable wa.me link,
// and the order confirmation that goes back into the chat. No server imports; unit-tested in
// tests/whatsapp-store.test.mjs. The server side is in ./server.ts.

import { buildButtons, clip, LIMITS, REPLY_IDS, type WhatsAppInteractive } from "../inbox/whatsapp-bot.ts";

/** Button and list-row ids the store sends, so a tap comes back as an exact cart action. */
export const STORE_IDS = { add: "a:", remove: "rm:", cart: "cart", checkout: "co", edit: "edit", clear: "clr" } as const;

/** One list holds 10 rows: up to 9 cart lines plus "Empty my cart". A payment link holds up to 10 products. */
export const CART_LIMITS = { lines: 9, perLine: 10 } as const;

export interface CartLine {
  productId: string;
  /** The product's option (size, colour); null while the customer still has to pick one. */
  variantId: string | null;
  quantity: number;
}

const PRODUCT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const VARIANT_ID = /^[A-Za-z0-9_.-]{1,80}$/;

const whole = (value: unknown, min: number, max: number) => {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : null;
};

/** The cart as stored (JSON), cleaned: known ids only, whole quantities within limits, same product and option merged. */
export function readCart(raw: unknown): CartLine[] {
  const out: CartLine[] = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const productId = typeof r.productId === "string" && PRODUCT_ID.test(r.productId) ? r.productId : null;
    const variantId = typeof r.variantId === "string" && VARIANT_ID.test(r.variantId) ? r.variantId : null;
    const quantity = typeof r.quantity === "number" && r.quantity >= 1 ? whole(r.quantity, 1, CART_LIMITS.perLine) : null;
    if (!productId || !quantity) continue;
    const same = out.find((line) => line.productId === productId && line.variantId === variantId);
    if (same) same.quantity = Math.min(CART_LIMITS.perLine, same.quantity + quantity);
    else if (out.length < CART_LIMITS.lines) out.push({ productId, variantId, quantity });
  }
  return out;
}

export const lineKey = (line: { productId: string; variantId?: string | null }) => (line.variantId ? `${line.productId}:${line.variantId}` : line.productId);

export type AddResult = { cart: CartLine[]; ok: true; quantity: number } | { cart: CartLine[]; ok: false; reason: "full" | "max" };

/**
 * Adds to the cart. Picking an option for a product that's in the cart without one fills that line in (the customer
 * tapped "Add to cart", then chose a size) instead of adding a second line.
 */
export function addToCart(cart: CartLine[], item: { productId: string; variantId?: string | null; quantity?: number }): AddResult {
  const variantId = item.variantId ?? null;
  const quantity = whole(item.quantity ?? 1, 1, CART_LIMITS.perLine) ?? 1;
  const next = cart.map((line) => ({ ...line }));
  const same = next.find((line) => line.productId === item.productId && line.variantId === variantId);
  const open = variantId ? next.find((line) => line.productId === item.productId && !line.variantId) : null;
  if (!same && open) {
    open.variantId = variantId;
    return { cart: readCart(next), ok: true, quantity: open.quantity };
  }
  if (same) {
    if (same.quantity >= CART_LIMITS.perLine) return { cart, ok: false, reason: "max" };
    same.quantity = Math.min(CART_LIMITS.perLine, same.quantity + quantity);
    return { cart: next, ok: true, quantity: same.quantity };
  }
  if (next.length >= CART_LIMITS.lines) return { cart, ok: false, reason: "full" };
  next.push({ productId: item.productId, variantId, quantity });
  return { cart: next, ok: true, quantity };
}

/** Takes one off a line (the line goes when it reaches 0). */
export function removeOne(cart: CartLine[], key: string): CartLine[] {
  return cart.flatMap((line) => (lineKey(line) !== key ? [line] : line.quantity > 1 ? [{ ...line, quantity: line.quantity - 1 }] : []));
}

/**
 * A cart the customer sent from WhatsApp's own catalog cart (an `order` message): retailer ids are store product
 * ids. Replaces the chat cart, since it is everything they picked.
 */
export function cartFromCatalogOrder(items: Array<{ productId: string; quantity: number }>): CartLine[] {
  return readCart(items.map((item) => ({ productId: item.productId, variantId: null, quantity: item.quantity })));
}

// ─── What the customer wants ─────────────────────────────────────────────────

export type StoreIntent =
  | { kind: "add"; productId: string; variantId: string | null }
  | { kind: "remove"; key: string }
  | { kind: "cart" }
  | { kind: "edit" }
  | { kind: "clear" }
  | { kind: "checkout" };

const CART_WORDS = ["cart", "my cart", "view cart", "see cart", "show cart", "basket", "my basket", "my bag", "wetin dey my cart"];
const CHECKOUT_WORDS = ["checkout", "check out", "pay now", "place order", "place my order", "i want to pay", "make payment", "i m done", "im done", "done shopping"];
const CLEAR_WORDS = ["empty cart", "empty my cart", "clear cart", "clear my cart", "remove everything", "start again", "start over"];

const flat = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function productAndOption(value: string): { productId: string; variantId: string | null } | null {
  const [productId, variantId, ...rest] = value.split(":");
  if (rest.length || !productId || !PRODUCT_ID.test(productId)) return null;
  if (variantId !== undefined && !VARIANT_ID.test(variantId)) return null;
  return { productId, variantId: variantId ?? null };
}

/**
 * A cart action, from a tapped button or list row (exact ids) or a short typed message that is only a cart word
 * ("cart", "checkout"), so "can I pay on delivery?" still goes to Peggy. Null when it isn't about the cart.
 */
export function detectStoreIntent(input: { text: string; replyId?: string | null }): StoreIntent | null {
  const id = (input.replyId ?? "").trim();
  if (id === STORE_IDS.cart) return { kind: "cart" };
  if (id === STORE_IDS.checkout) return { kind: "checkout" };
  if (id === STORE_IDS.edit) return { kind: "edit" };
  if (id === STORE_IDS.clear) return { kind: "clear" };
  if (id.startsWith(STORE_IDS.add)) {
    const picked = productAndOption(id.slice(STORE_IDS.add.length));
    if (picked) return { kind: "add", ...picked };
  }
  if (id.startsWith(STORE_IDS.remove)) {
    const picked = productAndOption(id.slice(STORE_IDS.remove.length));
    if (picked) return { kind: "remove", key: lineKey(picked) };
  }
  if (id) return null;
  const text = flat(input.text.slice(0, 80));
  if (!text || text.split(" ").length > 5) return null;
  if (CLEAR_WORDS.includes(text)) return { kind: "clear" };
  if (CHECKOUT_WORDS.includes(text)) return { kind: "checkout" };
  if (CART_WORDS.includes(text)) return { kind: "cart" };
  return null;
}

// ─── The cart, priced ────────────────────────────────────────────────────────

export interface SaleOption {
  id: string;
  name: string;
  /** Null: the product's price. */
  price: number | null;
  soldOut: boolean;
}

/** A product as the store sells it now (published, the database price, stock already worked out). */
export interface SaleProduct {
  id: string;
  name: string;
  price: number;
  soldOut: boolean;
  /** Its switched-on options; empty when it has none. */
  options: SaleOption[];
  imageUrl?: string | null;
}

export interface PricedLine {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  quantity: number;
  unit: number;
  total: number;
  /** The customer still has to pick a size or colour. */
  needsOption: boolean;
  /** Gone from the store, sold out, or the option was switched off. */
  unavailable: boolean;
}

/** Each line with today's price and name. Prices never come from the chat. */
export function priceCart(cart: CartLine[], products: Map<string, SaleProduct>): { lines: PricedLine[]; total: number; count: number } {
  const lines = cart.map((line): PricedLine => {
    const product = products.get(line.productId);
    if (!product) return { key: lineKey(line), productId: line.productId, variantId: line.variantId, name: "A product that's no longer available", quantity: line.quantity, unit: 0, total: 0, needsOption: false, unavailable: true };
    const option = line.variantId ? product.options.find((o) => o.id === line.variantId) ?? null : null;
    // A product with one option has nothing to choose (checkout picks it too).
    const only = !line.variantId && product.options.length === 1 ? product.options[0] : null;
    const chosen = option ?? only;
    const needsOption = !chosen && product.options.length > 1;
    const unit = chosen?.price ?? product.price;
    const unavailable = product.soldOut || Boolean(line.variantId && !option) || Boolean(chosen?.soldOut);
    return {
      key: lineKey(line),
      productId: line.productId,
      variantId: chosen?.id ?? line.variantId,
      name: chosen && product.options.length > 1 ? `${product.name} (${chosen.name})` : product.name,
      quantity: line.quantity,
      unit,
      total: unit * line.quantity,
      needsOption,
      unavailable,
    };
  });
  const ok = lines.filter((line) => !line.unavailable);
  return { lines, total: ok.reduce((sum, line) => sum + line.total, 0), count: ok.reduce((sum, line) => sum + line.quantity, 0) };
}

type Money = (amount: number) => string;

/** "2 × Ankara dress (M): ₦20,000" per line, then the total. */
export function cartText(priced: ReturnType<typeof priceCart>, money: Money) {
  const lines = priced.lines.map((line) =>
    line.unavailable
      ? `• ${line.name}: no longer available`
      : `• ${line.quantity} × ${line.name}${line.needsOption ? " (pick an option)" : ""}: ${money(line.total)}`,
  );
  return `${lines.join("\n")}\n\n*Total: ${money(priced.total)}*${priced.total > 0 ? " (delivery is added at checkout)" : ""}`;
}

export const KEEP_SHOPPING = { id: REPLY_IDS.menu, title: "Keep shopping" };

/** The cart with what to do next. An empty cart offers the products. */
export function buildCartMessage(priced: ReturnType<typeof priceCart>, money: Money, intro?: string): { body: string; interactive: WhatsAppInteractive } {
  if (!priced.lines.length) {
    const body = `${intro ? `${intro}\n\n` : ""}Your cart is empty. Tap below to see what we have.`;
    return { body, interactive: buildButtons(body, [{ id: REPLY_IDS.menu, title: "See products" }, { id: REPLY_IDS.human, title: "Talk to a person" }]) };
  }
  const head = intro ? `${intro}\n\n` : "";
  const body = `${head}🛒 *Your cart* (${priced.count} item${priced.count === 1 ? "" : "s"})\n${cartText(priced, money)}`;
  const buttons = [
    { id: STORE_IDS.checkout, title: "Checkout" },
    KEEP_SHOPPING,
    { id: STORE_IDS.edit, title: "Edit cart" },
  ];
  return { body, interactive: buildButtons(body, buttons) };
}

/** "Edit cart": tap a line to take one off, or empty the cart. */
export function buildEditList(priced: ReturnType<typeof priceCart>, money: Money): WhatsAppInteractive {
  const rows = priced.lines.slice(0, CART_LIMITS.lines).map((line) => ({
    id: `${STORE_IDS.remove}${line.key}`.slice(0, LIMITS.rowId),
    title: clip(`Remove 1 ${line.name}`, LIMITS.rowTitle),
    description: clip(line.unavailable ? "No longer available" : `${line.quantity} in cart · ${money(line.unit)} each`, LIMITS.rowDescription),
  }));
  return {
    type: "list",
    body: { text: "Tap an item to take one off your cart." },
    action: {
      button: "Edit cart",
      sections: [
        { title: "In your cart", rows },
        { title: "Or", rows: [{ id: STORE_IDS.clear, title: "Empty my cart" }] },
      ],
    },
  };
}

/** Which size or colour: one row per option that can be bought, with its price. Null when none can. */
export function buildOptionList(product: SaleProduct, money: Money): WhatsAppInteractive | null {
  const options = product.options.filter((option) => !option.soldOut).slice(0, LIMITS.rows);
  if (!options.length) return null;
  return {
    type: "list",
    header: { type: "text", text: clip(product.name, LIMITS.header) },
    body: { text: `Which one would you like? Tap an option to add it to your cart.` },
    action: {
      button: "Choose option",
      sections: [
        {
          title: "Options",
          rows: options.map((option) => ({ id: `${STORE_IDS.add}${product.id}:${option.id}`.slice(0, LIMITS.rowId), title: clip(option.name, LIMITS.rowTitle), description: clip(money(option.price ?? product.price), LIMITS.rowDescription) })),
        },
      ],
    },
  };
}

/** The checkout message: the order and one "Pay now" button that opens the store's secure payment page. */
export function buildPayMessage(priced: ReturnType<typeof priceCart>, money: Money, url: string, opts: { payOnDeliveryOnly: boolean; hours: number }): { body: string; interactive: WhatsAppInteractive } {
  const how = opts.payOnDeliveryOnly
    ? "Tap *Place order* to choose your delivery. When it arrives, you pay the shop with the link we send you, never the rider."
    : "Tap *Pay now* to choose your delivery and pay securely.";
  const text = `Here's your order:\n${cartText(priced, money)}\n\n${how} The link works for ${opts.hours} hours. You'll get your order confirmation right here.`;
  return {
    body: `${text}\n${url}`,
    interactive: {
      type: "cta_url",
      body: { text: text.slice(0, LIMITS.body) },
      action: { name: "cta_url", parameters: { display_text: opts.payOnDeliveryOnly ? "Place order" : "Pay now", url } },
    },
  };
}

// ─── Sharing the store ───────────────────────────────────────────────────────

/** The message a customer's WhatsApp fills in when they open the link; Peggy answers it with the products. */
export const SHARE_MESSAGE = "Hi! I'd like to see your products";

/** https://wa.me/<number>?text=…: opens a chat with the store, message ready to send. Null without a usable number. */
export function waMeLink(phone: string | null | undefined, text = SHARE_MESSAGE) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// ─── Order confirmations in the chat ─────────────────────────────────────────

export type ConfirmStage = "placed" | "paid";

const PAID = new Set(["paid", "processing", "packed", "shipped", "delivered"]);

/** Which confirmation an order is due: "paid" once paid, "placed" for transfer and pay on delivery, null otherwise. */
export function confirmStage(order: { status: string; paymentMethod: string | null }): ConfirmStage | null {
  if (PAID.has(order.status)) return "paid";
  if (order.status === "pending" && (order.paymentMethod === "transfer" || order.paymentMethod === "pay_on_delivery")) return "placed";
  return null;
}

export interface ConfirmationInput {
  stage: ConfirmStage;
  orderNumber: string;
  paymentMethod: string | null;
  items: Array<{ name: string; quantity: number; price: number }>;
  shippingFee: number;
  total: number;
  /** The customer's order page. */
  orderUrl: string;
}

/** The order confirmation the customer gets in the chat. */
export function confirmationText(input: ConfirmationInput, money: Money) {
  const items = input.items.slice(0, 12).map((item) => `• ${item.quantity} × ${item.name}: ${money(item.price * item.quantity)}`);
  if (input.items.length > 12) items.push(`• and ${input.items.length - 12} more`);
  const head =
    input.stage === "paid"
      ? `✅ *Payment received. Order ${input.orderNumber} is confirmed!*`
      : input.paymentMethod === "pay_on_delivery"
        ? `✅ *Order ${input.orderNumber} is confirmed!* You'll pay when it arrives.`
        : `🧾 *We've got your order ${input.orderNumber}.* It's confirmed as soon as your transfer arrives.`;
  const delivery = input.shippingFee > 0 ? `\nDelivery: ${money(input.shippingFee)}` : "";
  return `${head}\n\n${items.join("\n")}${delivery}\n*Total: ${money(input.total)}*\n\nTrack your order: ${input.orderUrl}\nReply here any time if you have a question.`;
}
