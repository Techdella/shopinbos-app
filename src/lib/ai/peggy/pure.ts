// Peggy's pure parts: request parsing, tool input schemas (one zod schema per tool, adapted to Claude and
// OpenAI), and the shop maths behind her snapshot and read tools. No server imports, so they are
// unit-tested in tests/behaviour.test.mjs.

import { z } from "zod";
import { startOfLagosDay } from "../../dashboard/compute.ts";
import { PAID_ORDER_STATUSES } from "../../insights.ts";
import { AD_PLATFORM_KEYS } from "../../../../shared/ads.ts";
import { SETUP_TOOL_SPECS } from "./setup-specs.ts";
import { INBOX_TOOL_SPECS } from "./inbox-specs.ts";
import { SOCIAL_TOOL_SPECS } from "./social-specs.ts";
import { REVIEWS_TOOL_SPECS } from "./reviews-specs.ts";
import { MARKETING_TOOL_SPECS } from "./marketing-specs.ts";
import { COMMERCE_TOOL_SPECS } from "./commerce-specs.ts";
import { CMS_TOOL_SPECS } from "./cms-specs.ts";
import { EMAIL_TOOL_SPECS } from "./email-specs.ts";
import { LEGAL_TOOL_SPECS } from "./legal-specs.ts";
import { PRODUCTS_TOOL_SPECS } from "./products-specs.ts";
import { ADS_TOOL_SPECS } from "./ads-specs.ts";
import { CATALOG_TOOL_SPECS } from "./catalog-specs.ts";
import { PAYLINKS_TOOL_SPECS } from "./paylinks-specs.ts";

const DAY = 86_400_000;
const PAID = new Set<string>(PAID_ORDER_STATUSES);

// ─── Request body ─────────────────────────────────────────────────────────────

export const PEGGY_MAX_TURNS = 20;
export const PEGGY_MAX_CHARS = 4000;

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(PEGGY_MAX_CHARS, `Keep each message under ${PEGGY_MAX_CHARS} characters`),
});

const BodySchema = z.union([
  z.object({ messages: z.array(TurnSchema).min(1).max(60) }),
  z.object({ message: z.string().max(PEGGY_MAX_CHARS, `Keep your message under ${PEGGY_MAX_CHARS} characters`) }),
]);

export interface PeggyTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The conversation to send to Peggy: the last PEGGY_MAX_TURNS non-empty turns, starting with the seller and
 * ending with the seller's newest message. Accepts `{ messages }` or the older `{ message }`.
 */
export function parsePeggyBody(body: unknown): { ok: true; turns: PeggyTurn[] } | { ok: false; error: string } {
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ask Peggy a question." };
  const raw: PeggyTurn[] = "messages" in parsed.data ? parsed.data.messages : [{ role: "user", content: parsed.data.message }];
  let turns = raw.map((turn) => ({ role: turn.role, content: turn.content.trim() })).filter((turn) => turn.content);
  turns = turns.slice(-PEGGY_MAX_TURNS);
  while (turns.length && turns[0].role !== "user") turns = turns.slice(1);
  if (!turns.length || turns[turns.length - 1].role !== "user") return { ok: false, error: "Ask Peggy a question." };
  return { ok: true, turns };
}

// ─── Tool inputs ──────────────────────────────────────────────────────────────

const limit = (max: number) => z.number().int().min(1).max(max).nullable().describe(`How many to return (1-${max}); null for the default`);

export const PEGGY_TOOL_SPECS = {
  sales_summary: {
    write: false,
    description: "Paid sales for a period (today, last 7, 30 or 90 days, Lagos time): total, order count, average order, best-selling items, and the change against the period before.",
    schema: z.object({ period: z.enum(["today", "7d", "30d", "90d"]) }).strict(),
  },
  list_orders: {
    write: false,
    description: "List the shop's orders. to_send = paid orders still to deliver; unpaid = waiting for payment; recent = newest orders of any status.",
    schema: z.object({ filter: z.enum(["to_send", "unpaid", "recent"]), limit: limit(20) }).strict(),
  },
  get_order: {
    write: false,
    description: "Full details of one order by its order number: items, customer, phone, address, payment, delivery and tracking.",
    schema: z.object({ orderNumber: z.string().trim().min(1).max(64) }).strict(),
  },
  list_products: {
    write: false,
    description: "List products. low_stock = at or below their low-stock level; draft = not published; best_sellers = most sold; search = name contains `query`; all = everything (newest first).",
    schema: z
      .object({
        filter: z.enum(["low_stock", "draft", "best_sellers", "search", "all"]),
        query: z.string().trim().max(120).nullable().describe("Words from the product name (needed for search)"),
        limit: limit(30),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.filter === "search" && !value.query) ctx.addIssue({ code: "custom", message: "Give a query to search for", path: ["query"] });
      }),
  },
  list_customers: {
    write: false,
    description: "Customers from paid orders. top = biggest spenders; recent = most recent buyers. Includes orders, total spent and last order date.",
    schema: z.object({ filter: z.enum(["top", "recent"]), limit: limit(20) }).strict(),
  },
  list_discounts: {
    write: false,
    description: "All discount codes with their status, value, uses and end date.",
    schema: z.object({}).strict(),
  },
  create_discount: {
    write: true,
    description:
      "Create a discount code. Set activate=true ONLY when the seller explicitly asked for the code to start or be live now; otherwise it is saved as a draft for them to switch on.",
    schema: z
      .object({
        code: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9_-]+$/, "Codes use letters, numbers, - or _ only").describe("The code buyers type, e.g. SALE20"),
        type: z.enum(["percentage", "fixed_amount", "free_shipping"]),
        value: z.number().nullable().describe("Percent off (1-100) for percentage, naira off for fixed_amount, null for free_shipping"),
        minOrder: z.number().min(0).nullable().describe("Minimum order in naira, or null"),
        endsAt: z.string().nullable().describe("End date as YYYY-MM-DD or ISO date-time, or null for no end"),
        activate: z.boolean().describe("true only if the seller asked to start it now"),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.type === "percentage" && (value.value === null || value.value <= 0 || value.value > 100)) {
          ctx.addIssue({ code: "custom", message: "A percentage discount needs a value between 1 and 100", path: ["value"] });
        }
        if (value.type === "fixed_amount" && (value.value === null || value.value <= 0)) {
          ctx.addIssue({ code: "custom", message: "A fixed discount needs an amount above 0", path: ["value"] });
        }
        if (value.endsAt && Number.isNaN(Date.parse(value.endsAt))) {
          ctx.addIssue({ code: "custom", message: "endsAt must be a date like 2026-12-31", path: ["endsAt"] });
        }
      }),
  },
  update_product: {
    write: true,
    description: "Change a product's price, stock count or status (published shows it in the shop, draft hides it). Identify it by product id or by name.",
    schema: z
      .object({
        product: z.string().trim().min(1).max(160).describe("Product id from list_products, or its name"),
        price: z.number().positive().max(100_000_000).nullable().describe("New price in naira, or null to keep"),
        stock: z.number().int().min(0).max(1_000_000).nullable().describe("New number in stock, or null to keep"),
        status: z.enum(["published", "draft"]).nullable().describe("New status, or null to keep"),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.price === null && value.stock === null && value.status === null) ctx.addIssue({ code: "custom", message: "Say what to change: price, stock or status" });
      }),
  },
  mark_order: {
    write: true,
    description: "Mark an order as paid (the seller received cash, transfer or POS), shipped (on its way) or delivered.",
    schema: z
      .object({
        orderNumber: z.string().trim().min(1).max(64),
        status: z.enum(["paid", "shipped", "delivered"]),
        paymentMethod: z.enum(["transfer", "cash", "pos"]).nullable().describe("How the buyer paid, when marking paid; null otherwise"),
      })
      .strict(),
  },
  draft_blog_post: {
    write: true,
    description: "Write a full blog article for the shop's blog and save it as a DRAFT the seller can review and publish. Never publishes.",
    schema: z.object({ title: z.string().trim().min(3).max(140), topic: z.string().trim().min(3).max(1000).describe("What the post should cover, products to mention, tone") }).strict(),
  },
  draft_broadcast: {
    write: true,
    description:
      "Save a broadcast to customers as a DRAFT. Never sends. email = saved as an email campaign the seller reviews and sends; whatsapp = saved to the activity log and returned as text to paste into WhatsApp.",
    schema: z
      .object({
        channel: z.enum(["email", "whatsapp"]),
        audience: z.enum(["all", "subscribers", "repeat_buyers", "top_spenders"]).describe("all = subscribers + past buyers; repeat_buyers = 2+ paid orders; top_spenders = spent ₦50,000+"),
        subject: z.string().trim().max(150).nullable().describe("Email subject line; null for WhatsApp"),
        message: z.string().trim().min(10).max(3000).describe("The full message, ready to send"),
      })
      .strict(),
  },
  draft_ad: {
    write: true,
    description: "Write an ad for one product and save it as a DRAFT with its own tracking link (the seller runs it and pays the platform).",
    schema: z
      .object({
        productName: z.string().trim().min(1).max(160).describe("Product id or name"),
        platform: z.enum(AD_PLATFORM_KEYS),
        destination: z.enum(["whatsapp", "store"]).nullable().describe("Where a tap goes: a WhatsApp chat or the product page; null to choose automatically"),
        dailyBudget: z.number().min(500).max(1_000_000).nullable().describe("Naira per day, null for ₦2,000"),
        days: z.number().int().min(1).max(30).nullable().describe("How many days, null for 5"),
      })
      .strict(),
  },
  write_copy: {
    write: true,
    description: "Write marketing text (a WhatsApp status, an Instagram caption or a product description). Returns text only; changes nothing in the shop.",
    schema: z.object({ kind: z.enum(["whatsapp_status", "instagram_caption", "product_description"]), about: z.string().trim().min(3).max(1000) }).strict(),
  },
  ...SETUP_TOOL_SPECS,
  ...INBOX_TOOL_SPECS,
  ...SOCIAL_TOOL_SPECS,
  ...REVIEWS_TOOL_SPECS,
  ...MARKETING_TOOL_SPECS,
  ...COMMERCE_TOOL_SPECS,
  ...CMS_TOOL_SPECS,
  ...EMAIL_TOOL_SPECS,
  ...LEGAL_TOOL_SPECS,
  ...PRODUCTS_TOOL_SPECS,
  ...ADS_TOOL_SPECS,
  ...CATALOG_TOOL_SPECS,
  ...PAYLINKS_TOOL_SPECS,
} as const;

export type PeggyToolName = keyof typeof PEGGY_TOOL_SPECS;
export const PEGGY_TOOL_NAMES = Object.keys(PEGGY_TOOL_SPECS) as PeggyToolName[];
export type PeggyToolInput<N extends PeggyToolName> = z.infer<(typeof PEGGY_TOOL_SPECS)[N]["schema"]>;

/** Validates a model's tool arguments (an object, or a JSON string from OpenAI). */
export function parseToolInput<N extends PeggyToolName>(name: N, raw: unknown): { ok: true; input: PeggyToolInput<N> } | { ok: false; error: string } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return { ok: false, error: "The tool arguments were not valid JSON." };
    }
  }
  const result = (PEGGY_TOOL_SPECS[name].schema as z.ZodType).safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return { ok: false, error: `Invalid input. ${where}${issue?.message ?? "Check the arguments."}` };
  }
  return { ok: true, input: result.data as PeggyToolInput<N> };
}

// ─── Confirmation codes ───────────────────────────────────────────────────────

const CODE_IN_RESULT = /Confirmation code: ([A-Z0-9]{4,12})\b/g;

/**
 * Codes a tool handed out in its result ("Confirmation code: AB12CD"). The agent remembers them for the rest of
 * the request so the model can't approve its own preview in the same turn: a code only works once the seller
 * has answered in a new message.
 */
export function issuedConfirmationCodes(content: string): string[] {
  return [...content.matchAll(CODE_IN_RESULT)].map((match) => match[1]);
}

/** The confirmation code a tool call presents (its `confirmCode` argument), upper-cased; null when none. */
export function presentedConfirmationCode(input: unknown): string | null {
  if (!input || typeof input !== "object" || !("confirmCode" in input)) return null;
  const code = (input as { confirmCode?: unknown }).confirmCode;
  return typeof code === "string" && code.trim() ? code.trim().toUpperCase() : null;
}

/** The parts a send-a-reply confirmation code is tied to: the conversation and the exact words (spacing aside). */
export function replyConfirmationParts(storeId: string, conversationId: string, message: string) {
  return [storeId, "reply", conversationId, message.replace(/\s+/g, " ").trim()];
}

/** The parts a review-reply confirmation code is tied to: the review and the exact words (spacing aside). */
export function reviewReplyConfirmationParts(storeId: string, reviewKey: string, reply: string) {
  return [storeId, "review-reply", reviewKey, reply.replace(/\s+/g, " ").trim()];
}

/** The parts a review publish / hide / feature code is tied to: the action and exactly these reviews. */
export function reviewModerationConfirmationParts(storeId: string, action: string, reviewKeys: string[]) {
  return [storeId, "review-moderate", action, [...new Set(reviewKeys)].sort().join(",")];
}

/** The parts a review-request confirmation code is tied to: the channel and exactly these orders. */
export function reviewRequestConfirmationParts(storeId: string, channel: string, orderIds: string[]) {
  return [storeId, "reviews", channel, [...orderIds].sort().join(",")];
}

const SCHEMA_KEYS = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "const", "anyOf", "description"]);

/**
 * JSON schema for a tool's input that both Claude and OpenAI accept in strict mode: every property required,
 * additionalProperties false, and no length/number constraints (zod checks those when the tool runs).
 */
export function providerSchema(schema: z.ZodType): Record<string, unknown> {
  const clean = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (!SCHEMA_KEYS.has(key)) continue;
      if (key === "properties") {
        out.properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([prop, sub]) => [prop, clean(sub)]));
      } else {
        out[key] = clean(value);
      }
    }
    if (out.type === "object") {
      out.properties ??= {};
      out.required = Object.keys(out.properties as Record<string, unknown>);
      out.additionalProperties = false;
    }
    return out;
  };
  return clean(z.toJSONSchema(schema, { io: "input" })) as Record<string, unknown>;
}

// ─── Shop maths ───────────────────────────────────────────────────────────────

export interface PeggyOrder {
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  total: number;
  status: string;
  createdAt: Date;
  items: unknown;
}

export const PERIOD_DAYS = { today: 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type SalesPeriod = keyof typeof PERIOD_DAYS;

function paidIn(orders: PeggyOrder[], from: number, to: number) {
  return orders.filter((o) => PAID.has(o.status) && o.createdAt.getTime() >= from && o.createdAt.getTime() < to);
}

const sumTotals = (orders: PeggyOrder[]) => orders.reduce((total, o) => total + (Number(o.total) || 0), 0);

/** Paid sales today, over the last 7 days and over the last 30 days (Lagos days, today included). */
export function periodSales(orders: PeggyOrder[], now = new Date()) {
  const today = startOfLagosDay(now).getTime();
  const end = today + DAY;
  const at = (days: number) => {
    const paid = paidIn(orders, today - (days - 1) * DAY, end);
    return { total: sumTotals(paid), orders: paid.length };
  };
  return { today: at(1), week: at(7), month: at(30) };
}

function lineItems(items: unknown): { name: string; quantity: number; price: number }[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: String(item.name ?? item.title ?? "Item"),
      quantity: Math.max(1, Number(item.quantity ?? 1) || 1),
      price: Number(item.price ?? 0) || 0,
    }));
}

/** sales_summary: the period against the one before it, with the best-selling items by quantity. */
export function summarizeSales(orders: PeggyOrder[], period: SalesPeriod, now = new Date()) {
  const days = PERIOD_DAYS[period];
  const end = startOfLagosDay(now).getTime() + DAY;
  const start = end - days * DAY;
  const current = paidIn(orders, start, end);
  const previous = paidIn(orders, start - days * DAY, start);
  const total = sumTotals(current);
  const before = sumTotals(previous);
  const items = new Map<string, { name: string; quantity: number; revenue: number }>();
  for (const order of current) {
    for (const line of lineItems(order.items)) {
      const entry = items.get(line.name) ?? { name: line.name, quantity: 0, revenue: 0 };
      entry.quantity += line.quantity;
      entry.revenue += line.price * line.quantity;
      items.set(line.name, entry);
    }
  }
  return {
    period,
    total,
    orders: current.length,
    averageOrder: current.length ? Math.round(total / current.length) : 0,
    previousTotal: before,
    changePercent: before > 0 ? Math.round(((total - before) / before) * 100) : null,
    topItems: [...items.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 5),
  };
}

export interface PeggyCustomer {
  name: string;
  email: string;
  phone: string | null;
  orders: number;
  spent: number;
  lastOrderAt: Date;
}

/** Customers from paid orders, grouped by email (case-insensitive). */
export function aggregateCustomers(orders: PeggyOrder[], sort: "top" | "recent" = "top"): PeggyCustomer[] {
  const customers = new Map<string, PeggyCustomer>();
  for (const order of orders) {
    if (!PAID.has(order.status)) continue;
    const key = order.buyerEmail.trim().toLowerCase() || `name:${order.buyerName.trim().toLowerCase()}`;
    const entry = customers.get(key) ?? { name: order.buyerName, email: order.buyerEmail.trim().toLowerCase(), phone: order.buyerPhone ?? null, orders: 0, spent: 0, lastOrderAt: order.createdAt };
    entry.orders += 1;
    entry.spent += Number(order.total) || 0;
    if (order.createdAt >= entry.lastOrderAt) {
      entry.lastOrderAt = order.createdAt;
      entry.name = order.buyerName || entry.name;
      entry.phone = order.buyerPhone ?? entry.phone;
    }
    customers.set(key, entry);
  }
  const list = [...customers.values()];
  return sort === "top"
    ? list.sort((a, b) => b.spent - a.spent || b.orders - a.orders)
    : list.sort((a, b) => b.lastOrderAt.getTime() - a.lastOrderAt.getTime());
}

export interface PeggyStockProduct {
  id: string;
  name: string;
  currentStock: number;
  lowStockThreshold: number;
  soldStock: number;
  status: string;
  /** false: not tracked (never low). */
  trackStock?: boolean;
}

/** Products at or below their own low-stock level, best sellers and emptiest first. */
export function lowStockProducts<T extends PeggyStockProduct>(products: T[]): T[] {
  return products
    .filter((p) => p.status !== "archived" && p.trackStock !== false && p.currentStock <= p.lowStockThreshold)
    .sort((a, b) => b.soldStock - a.soldStock || a.currentStock - b.currentStock);
}

/**
 * Finds the product a seller means: an exact id, then an exact name (any case), then names containing every
 * word. Returns all candidates so the caller can ask which one when there are several.
 */
export function matchProducts<T extends { id: string; name: string }>(products: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byId = products.filter((p) => p.id === query.trim());
  if (byId.length) return byId;
  const exact = products.filter((p) => p.name.trim().toLowerCase() === q);
  if (exact.length) return exact;
  const words = q.split(/\s+/).filter(Boolean);
  return products.filter((p) => {
    const name = p.name.toLowerCase();
    return words.every((word) => name.includes(word));
  });
}

/** Discount codes are stored upper-case without spaces. */
export function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** End-of-day for a bare date (YYYY-MM-DD, Lagos time); otherwise the parsed instant. Null when invalid. */
export function parseEndDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (bare) {
    const date = new Date(`${value.trim()}T23:59:59+01:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
