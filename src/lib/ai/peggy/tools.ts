import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { sellerWhatsapp } from "@/lib/ads";
import { escapeHtml } from "@/lib/campaigns/render";
import { orderRow } from "@/lib/dashboard/compute";
import { updateOrderStatus } from "@/lib/orders/update-status";
import { AD_PLATFORMS, adCode, fallbackAdCopy } from "@shared/ads";
import { naira } from "@shared/onboarding";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { SETUP_TOOL_RUNNERS } from "./setup-tools";
import { INBOX_TOOL_RUNNERS } from "./inbox-tools";
import { SOCIAL_TOOL_RUNNERS } from "./social-tools";
import { REVIEWS_TOOL_RUNNERS } from "./reviews-tools";
import { MARKETING_TOOL_RUNNERS } from "./marketing-tools";
import { COMMERCE_TOOL_RUNNERS } from "./commerce-tools";
import { CMS_TOOL_RUNNERS } from "./cms-tools";
import { EMAIL_TOOL_RUNNERS } from "./email-tools";
import { LEGAL_TOOL_RUNNERS } from "./legal-tools";
import { PRODUCTS_TOOL_RUNNERS } from "./products-tools";
import { saveMarkdownPost } from "@/lib/cms/server";
import {
  aggregateCustomers,
  lowStockProducts,
  matchProducts,
  normalizeCode,
  parseEndDate,
  summarizeSales,
  PERIOD_DAYS,
  PEGGY_TOOL_SPECS,
  type PeggyToolInput,
  type PeggyToolName,
} from "./pure";

// Peggy's tools. Each one is defined once (name, description, zod schema in ./pure, run here) and adapted
// to Claude and OpenAI in ./agent. Every tool is scoped to the signed-in seller's store: the store comes
// from the session, never from the model.

export interface PeggyAction {
  tool: string;
  summary: string;
  href?: string;
}

export interface PeggyToolContext {
  userId: string;
  userPhone: string | null;
  store: { id: string; name: string; slug: string; currency: string };
}

export interface ToolOutput {
  /** What the model reads back. */
  content: string;
  /** For write tools: the card the seller sees, and the summary Peggy confirms. */
  action?: { summary: string; href?: string };
}

/** A problem the model should hear about (and can usually fix or explain), sent back as an error result. */
export class ToolError extends Error {}

const DAY = 86_400_000;
const PAID_STATUSES = ["paid", "processing", "packed", "shipped", "delivered"] as const;

const money = (amount: number) => naira(Number(amount) || 0);
const dateOnly = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short", year: "numeric" }).format(date);

export async function recordActivity(ctx: PeggyToolContext, event: { type: string; title: string; description?: string; tool: string; link?: string; data?: Record<string, unknown> }) {
  await db.activityEvent
    .create({
      data: {
        storeId: ctx.store.id,
        userId: ctx.userId,
        type: event.type,
        title: event.title,
        description: event.description ?? null,
        metadata: { source: "peggy", tool: event.tool, link: event.link ?? null, ...(event.data ?? {}) } as Prisma.InputJsonValue,
      },
    })
    .catch((error) => console.error("[peggy] activity log failed", error));
}

async function meterExtra(ctx: PeggyToolContext) {
  if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance. Tell them it resets within 24 hours or with a plan upgrade.");
}

async function findOrder(ctx: PeggyToolContext, orderNumber: string) {
  const wanted = orderNumber.trim().replace(/^#/, "");
  const order = await db.retailOrder.findFirst({ where: { storeId: ctx.store.id, orderNumber: { equals: wanted, mode: "insensitive" } } });
  if (!order) throw new ToolError(`No order ${wanted} in this shop. Use list_orders to see order numbers.`);
  return order;
}

async function storeProducts(ctx: PeggyToolContext) {
  return db.storeProduct.findMany({
    where: { storeId: ctx.store.id, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { id: true, name: true, status: true, retailPrice: true, costPrice: true, currentStock: true, lowStockThreshold: true, soldStock: true, trackStock: true, description: true, images: true },
  });
}

export async function findProduct(ctx: PeggyToolContext, query: string) {
  const matches = matchProducts(await storeProducts(ctx), query);
  if (!matches.length) throw new ToolError(`No product matches "${query}". Use list_products to find it.`);
  if (matches.length > 1) {
    throw new ToolError(
      `"${query}" matches ${matches.length} products: ${matches.slice(0, 6).map((p) => `${p.name} (id ${p.id})`).join("; ")}. Ask the seller which one, or call again with the id.`,
    );
  }
  return matches[0];
}

// ─── Read tools ───────────────────────────────────────────────────────────────

async function salesSummary(ctx: PeggyToolContext, input: PeggyToolInput<"sales_summary">): Promise<ToolOutput> {
  const since = new Date(Date.now() - (PERIOD_DAYS[input.period] * 2 + 1) * DAY);
  const orders = await db.retailOrder.findMany({
    where: { storeId: ctx.store.id, createdAt: { gte: since }, status: { in: [...PAID_STATUSES] } },
    take: 10000,
    select: { orderNumber: true, buyerName: true, buyerEmail: true, total: true, status: true, createdAt: true, items: true },
  });
  const summary = summarizeSales(orders.map((o) => ({ ...o, total: Number(o.total) })), input.period);
  return {
    content: JSON.stringify({
      ...summary,
      total: money(summary.total),
      averageOrder: money(summary.averageOrder),
      previousTotal: money(summary.previousTotal),
      topItems: summary.topItems.map((item) => ({ ...item, revenue: money(item.revenue) })),
      note: "Paid orders only, Lagos time. changePercent compares with the same length of time just before.",
    }),
  };
}

async function listOrders(ctx: PeggyToolContext, input: PeggyToolInput<"list_orders">): Promise<ToolOutput> {
  const status =
    input.filter === "to_send" ? { in: ["paid", "processing", "packed"] as const } : input.filter === "unpaid" ? { in: ["pending", "awaiting_payment"] as const } : undefined;
  const orders = await db.retailOrder.findMany({
    where: { storeId: ctx.store.id, ...(status ? { status: { in: [...status.in] } } : {}) },
    orderBy: { createdAt: input.filter === "recent" ? "desc" : "asc" },
    take: input.limit ?? 10,
  });
  return {
    content: JSON.stringify({
      filter: input.filter,
      count: orders.length,
      orders: orders.map((order) => {
        const row = orderRow({ ...order, total: Number(order.total) });
        return { orderNumber: order.orderNumber, buyer: row.buyer, items: row.summary, stage: row.stage.label, payment: row.payment.label, total: money(row.total), placed: dateOnly(order.createdAt), link: `/home/orders/${order.id}` };
      }),
    }),
  };
}

async function getOrder(ctx: PeggyToolContext, input: PeggyToolInput<"get_order">): Promise<ToolOutput> {
  const order = await findOrder(ctx, input.orderNumber);
  const row = orderRow({ ...order, total: Number(order.total) });
  return {
    content: JSON.stringify({
      orderNumber: order.orderNumber,
      status: order.status,
      stage: row.stage.label,
      payment: row.payment.label,
      paymentMethod: order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod : null,
      buyer: { name: order.buyerName, email: order.buyerEmail, phone: order.buyerPhone },
      deliveryAddress: order.deliveryAddress,
      items: order.items,
      subtotal: money(order.subtotal),
      deliveryFee: money(order.shippingFee),
      discount: order.discountCode ? { code: order.discountCode, amount: money(order.discountAmount ?? 0) } : null,
      total: money(order.total),
      delivery: order.logisticsDetails,
      trackingCode: order.trackingCode,
      channel: order.channel,
      notes: order.notes,
      placed: order.createdAt.toISOString(),
      shippedAt: order.shippedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      link: `/home/orders/${order.id}`,
    }),
  };
}

async function listProducts(ctx: PeggyToolContext, input: PeggyToolInput<"list_products">): Promise<ToolOutput> {
  let products = await storeProducts(ctx);
  if (input.filter === "low_stock") products = lowStockProducts(products);
  else if (input.filter === "draft") products = products.filter((p) => p.status === "draft");
  else if (input.filter === "best_sellers") products = products.filter((p) => p.soldStock > 0).sort((a, b) => b.soldStock - a.soldStock);
  else if (input.filter === "search") products = matchProducts(products, input.query ?? "");
  const list = products.slice(0, input.limit ?? 15);
  return {
    content: JSON.stringify({
      filter: input.filter,
      count: products.length,
      products: list.map((p) => ({ id: p.id, name: p.name, price: money(p.retailPrice), stock: p.currentStock, lowStockAt: p.lowStockThreshold, sold: p.soldStock, status: p.status, link: `/products/${p.id}` })),
    }),
  };
}

async function listCustomers(ctx: PeggyToolContext, input: PeggyToolInput<"list_customers">): Promise<ToolOutput> {
  const orders = await db.retailOrder.findMany({
    where: { storeId: ctx.store.id, status: { in: [...PAID_STATUSES] } },
    orderBy: { createdAt: "desc" },
    take: 10000,
    select: { orderNumber: true, buyerName: true, buyerEmail: true, buyerPhone: true, total: true, status: true, createdAt: true, items: true },
  });
  const customers = aggregateCustomers(orders.map((o) => ({ ...o, total: Number(o.total) })), input.filter);
  return {
    content: JSON.stringify({
      filter: input.filter,
      count: customers.length,
      customers: customers.slice(0, input.limit ?? 10).map((c) => ({ name: c.name, email: c.email, phone: c.phone, orders: c.orders, spent: money(c.spent), lastOrder: dateOnly(c.lastOrderAt) })),
    }),
  };
}

async function listDiscounts(ctx: PeggyToolContext): Promise<ToolOutput> {
  const discounts = await db.discount.findMany({ where: { storeId: ctx.store.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return {
    content: JSON.stringify({
      count: discounts.length,
      discounts: discounts.map((d) => ({
        code: d.code,
        type: d.type,
        value: d.type === "percentage" ? `${d.value}%` : d.type === "fixed_amount" ? money(d.value) : null,
        status: d.status,
        minOrder: d.minOrder ? money(d.minOrder) : null,
        used: d.usedCount,
        maxUses: d.maxUses || null,
        ends: d.expiresAt ? dateOnly(d.expiresAt) : null,
      })),
    }),
  };
}

// ─── Write tools ──────────────────────────────────────────────────────────────

async function createDiscount(ctx: PeggyToolContext, input: PeggyToolInput<"create_discount">): Promise<ToolOutput> {
  const code = normalizeCode(input.code);
  const expiresAt = parseEndDate(input.endsAt);
  if (input.endsAt && !expiresAt) throw new ToolError("endsAt must be a date like 2026-12-31.");
  if (expiresAt && expiresAt.getTime() <= Date.now()) throw new ToolError("The end date is in the past. Ask the seller for a future date.");
  const existing = await db.discount.findUnique({ where: { storeId_code: { storeId: ctx.store.id, code } }, select: { status: true } });
  if (existing) throw new ToolError(`The code ${code} already exists (${existing.status}). Suggest a different code.`);

  const value = input.type === "free_shipping" ? 0 : (input.value ?? 0);
  const status = input.activate ? "active" : "draft";
  await db.discount.create({
    data: {
      storeId: ctx.store.id,
      name: code,
      code,
      type: input.type,
      value,
      minOrder: input.minOrder ?? null,
      startsAt: input.activate ? new Date() : null,
      expiresAt,
      status,
    },
  });

  const what = input.type === "percentage" ? `${value}% off` : input.type === "fixed_amount" ? `${money(value)} off` : "free delivery";
  const summary = `Created discount ${code}: ${what}${input.minOrder ? ` on orders over ${money(input.minOrder)}` : ""}${expiresAt ? `, ends ${dateOnly(expiresAt)}` : ""}. ${status === "active" ? "It is live now." : "Saved as a draft (not live yet)."}`;
  await recordActivity(ctx, { type: "discount", title: `Peggy created discount ${code}`, description: summary, tool: "create_discount", link: "/home/discounts", data: { code, status } });
  return { content: summary, action: { summary, href: "/home/discounts" } };
}

async function updateProduct(ctx: PeggyToolContext, input: PeggyToolInput<"update_product">): Promise<ToolOutput> {
  const product = await findProduct(ctx, input.product);
  const changes: string[] = [];
  const data: Prisma.StoreProductUpdateInput = {};

  if (input.price !== null && input.price !== product.retailPrice) {
    data.retailPrice = input.price;
    if (product.costPrice != null) data.margin = parseFloat((((input.price - product.costPrice) / input.price) * 100).toFixed(2));
    changes.push(`price ${money(product.retailPrice)} → ${money(input.price)}`);
  }
  const stockChange = input.stock !== null ? input.stock - product.currentStock : 0;
  if (input.stock !== null && stockChange !== 0) {
    data.currentStock = input.stock;
    // Giving a product a count means counting it: checkout then sells only what is there.
    if (input.stock > 0) data.trackStock = true;
    changes.push(`stock ${product.currentStock} → ${input.stock}`);
  }
  if (input.status !== null && input.status !== product.status) {
    data.status = input.status;
    changes.push(input.status === "published" ? "published (now in the shop)" : "moved to draft (hidden from the shop)");
  }
  if (!changes.length) return { content: `${product.name} already has those values; nothing changed.` };

  await db.$transaction([
    db.storeProduct.update({ where: { id: product.id }, data }),
    ...(stockChange !== 0
      ? [
          db.stockMovement.create({
            data: { storeId: ctx.store.id, productId: product.id, change: stockChange, type: stockChange > 0 ? "addition" : "removal", note: `Peggy: stock updated from ${product.currentStock} to ${input.stock}` },
          }),
        ]
      : []),
  ]);

  const summary = `Updated ${product.name}: ${changes.join(", ")}.`;
  const href = `/products/${product.id}`;
  await recordActivity(ctx, { type: "product", title: `Peggy updated ${product.name}`, description: summary, tool: "update_product", link: href, data: { productId: product.id } });
  return { content: summary, action: { summary, href } };
}

async function markOrder(ctx: PeggyToolContext, input: PeggyToolInput<"mark_order">): Promise<ToolOutput> {
  const order = await findOrder(ctx, input.orderNumber);
  if (["cancelled", "refunded", "partially_refunded", "returned"].includes(order.status)) {
    throw new ToolError(`Order ${order.orderNumber} is ${order.status}, so it can't be marked ${input.status}.`);
  }
  if (order.status === input.status) return { content: `Order ${order.orderNumber} is already ${input.status}; nothing changed.` };
  if (input.status === "shipped" && order.status === "delivered") throw new ToolError(`Order ${order.orderNumber} is already delivered.`);

  const result = await updateOrderStatus(ctx.store, order, { status: input.status, paymentMethod: input.paymentMethod ?? undefined });
  if (!result.ok) throw new ToolError(`${result.error} (order ${order.orderNumber}).`);

  const stage = orderRow({ ...result.order, total: Number(result.order.total) }).stage.label;
  const how = input.status === "paid" ? ` (${PAYMENT_METHOD_LABEL[result.order.paymentMethod ?? "transfer"] ?? result.order.paymentMethod})` : "";
  const summary = `Marked order ${order.orderNumber} (${order.buyerName}, ${money(order.total)}) as ${input.status}${how}. It now shows "${stage}".`;
  const href = `/home/orders/${order.id}`;
  await recordActivity(ctx, { type: "order", title: `Peggy marked order ${order.orderNumber} ${input.status}`, description: summary, tool: "mark_order", link: href, data: { orderId: order.id, from: order.status, to: result.order.status } });
  return { content: summary, action: { summary, href } };
}

async function draftBlogPost(ctx: PeggyToolContext, input: PeggyToolInput<"draft_blog_post">): Promise<ToolOutput> {
  await meterExtra(ctx);
  const products = await db.storeProduct.findMany({ where: { storeId: ctx.store.id, status: "published" }, orderBy: { soldStock: "desc" }, take: 8, select: { name: true, retailPrice: true } });
  const written = await aiText({
    system: `You write blog posts for ${ctx.store.name}, a small online shop in Nigeria. Warm, clear Nigerian English. Useful to readers first, selling second. No emojis. Never invent facts about the shop (prices, delivery times, materials) beyond what you are given.`,
    prompt: [
      `Title: ${input.title}`,
      `Brief: ${input.topic}`,
      products.length ? `Products the shop sells (mention only where natural): ${products.map((p) => `${p.name} (${money(p.retailPrice)})`).join(", ")}` : "",
      'Return JSON only: {"excerpt": "1-2 sentences, under 300 characters", "bodyMarkdown": "the full article in Markdown, 500-900 words, with ## subheadings", "metaDescription": "under 155 characters", "keywords": ["4-6 search keywords"]}',
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (!written) throw new ToolError("The writing service didn't answer. Tell the seller to try again in a moment.");
  const json = firstJsonObject(written.text);
  const body = typeof json?.bodyMarkdown === "string" && json.bodyMarkdown.trim() ? json.bodyMarkdown.trim() : written.text.trim();
  const excerpt = typeof json?.excerpt === "string" ? json.excerpt.trim().slice(0, 500) : "";
  const metaDescription = typeof json?.metaDescription === "string" ? json.metaDescription.trim().slice(0, 160) : excerpt.slice(0, 160);
  const keywords = Array.isArray(json?.keywords) ? json.keywords.map(String).map((k) => k.trim()).filter(Boolean).slice(0, 8) : [];

  // Saved in the store's Blog collection (CMS) as a draft; the seller reviews and publishes it there.
  const title = input.title.trim();
  const item = await saveMarkdownPost(ctx.store.id, { title, excerpt, bodyMarkdown: body, metaTitle: title.slice(0, 70), metaDescription, keywords, status: "draft" }, "peggy");
  const post = { id: item.id, wordCount: body.split(/\s+/).filter(Boolean).length };
  const href = `/home/cms/${item.collectionId}/${item.id}`;

  const summary = `Wrote "${title}" (${post.wordCount} words) and saved it as a draft blog post. It is not published.`;
  await recordActivity(ctx, { type: "content", title: `Peggy drafted a blog post: ${title}`, description: summary, tool: "draft_blog_post", link: href, data: { postId: post.id } });
  return { content: `${summary}\nExcerpt: ${excerpt}`, action: { summary, href } };
}

const AUDIENCE_FILTER = {
  all: { mode: "all" },
  subscribers: { mode: "subscribers" },
  repeat_buyers: { mode: "min_orders", value: 2 },
  top_spenders: { mode: "min_spend", value: 50_000 },
} as const;

const AUDIENCE_LABEL = { all: "subscribers and past buyers", subscribers: "email subscribers", repeat_buyers: "repeat buyers", top_spenders: "top spenders (₦50,000+)" } as const;

async function draftBroadcast(ctx: PeggyToolContext, input: PeggyToolInput<"draft_broadcast">): Promise<ToolOutput> {
  if (input.channel === "whatsapp") {
    const summary = `Drafted a WhatsApp broadcast for ${AUDIENCE_LABEL[input.audience]}. Nothing was sent; copy it into WhatsApp to send.`;
    await recordActivity(ctx, { type: "marketing", title: "Peggy drafted a WhatsApp broadcast", description: input.message, tool: "draft_broadcast", data: { channel: "whatsapp", audience: input.audience } });
    return { content: `${summary}\nThe message (show it to the seller in full):\n${input.message}`, action: { summary } };
  }

  const subject = (input.subject?.trim() || input.message.split("\n")[0]).slice(0, 150);
  const bodyHtml = input.message
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const campaign = await db.broadcastCampaign.create({
    data: {
      storeId: ctx.store.id,
      name: `Peggy draft: ${subject}`.slice(0, 120),
      subject,
      bodyHtml,
      senderName: ctx.store.name,
      campaignType: "custom",
      recipientFilter: AUDIENCE_FILTER[input.audience],
      status: "draft",
    },
  });
  const summary = `Saved an email campaign "${subject}" for ${AUDIENCE_LABEL[input.audience]} as a draft. Nothing was sent; review it and press send when ready.`;
  const href = `/home/marketing/campaigns/${campaign.id}`;
  await recordActivity(ctx, { type: "marketing", title: `Peggy drafted an email: ${subject}`, description: summary, tool: "draft_broadcast", link: href, data: { campaignId: campaign.id, audience: input.audience } });
  return { content: summary, action: { summary, href } };
}

async function draftAd(ctx: PeggyToolContext, input: PeggyToolInput<"draft_ad">): Promise<ToolOutput> {
  const product = await findProduct(ctx, input.productName);
  await meterExtra(ctx);
  const whatsapp = await sellerWhatsapp(ctx.store.id, ctx.userPhone);
  const destination = input.destination === "whatsapp" && !whatsapp ? "store" : (input.destination ?? (whatsapp ? "whatsapp" : "store"));
  const price = naira(product.retailPrice);
  const platform = AD_PLATFORMS.find((item) => item.key === input.platform)!;
  const fallback = fallbackAdCopy(product.name, price, destination);
  // Same brief as POST /api/app/ads, so an ad Peggy drafts reads like one made from the Ads screen.
  const raw = (
    await aiText({
      fast: true,
      prompt: [
        `Write a ${platform.label} ad for ${ctx.store.name}, a small Nigerian online shop.`,
        `Product: ${product.name}, ${price}.${product.description ? ` Details: ${product.description.slice(0, 400)}` : ""}`,
        destination === "whatsapp"
          ? "The ad's button opens a WhatsApp chat with the shop, so end by inviting people to send a WhatsApp message."
          : "The ad's button opens the product page, so end by inviting people to tap to order.",
        'Return JSON only: {"headline": "max 8 words", "primaryText": "2-3 short sentences, under 45 words, warm Nigerian English, mention the price once"}.',
        "No emojis, no hashtags, no claims that aren't in the details (materials, discounts, delivery times).",
      ].join("\n"),
    })
  )?.text ?? null;
  const copy = firstJsonObject(raw);
  const headline = typeof copy?.headline === "string" && copy.headline.trim() ? copy.headline.trim().slice(0, 80) : fallback.headline;
  const primaryText = typeof copy?.primaryText === "string" && copy.primaryText.trim() ? copy.primaryText.trim().slice(0, 500) : fallback.primaryText;
  const dailyBudget = input.dailyBudget ?? 2000;
  const days = input.days ?? 5;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = adCode();
    if (await db.adCampaign.findUnique({ where: { code }, select: { id: true } })) continue;
    await db.adCampaign.create({
      data: { storeId: ctx.store.id, storeProductId: product.id, code, platform: input.platform, destination, headline, primaryText, imageUrl: product.images[0] ?? null, dailyBudget, days },
    });
    const summary = `Drafted a ${platform.label} ad for ${product.name} (${money(dailyBudget)}/day for ${days} day${days === 1 ? "" : "s"}, taps go to ${destination === "whatsapp" ? "your WhatsApp" : "the product page"}). Headline: "${headline}". It is a draft; nothing is running or charged.`;
    await recordActivity(ctx, { type: "marketing", title: `Peggy drafted a ${platform.label} ad`, description: summary, tool: "draft_ad", link: "/home/ads", data: { code, productId: product.id } });
    return { content: `${summary}\nAd text: ${primaryText}`, action: { summary, href: "/home/ads" } };
  }
  throw new ToolError("Couldn't save the ad just now. Ask the seller to try again.");
}

const COPY_BRIEF = {
  whatsapp_status: "a WhatsApp status: 1-3 short lines, under 200 characters, with a clear call to message or order",
  instagram_caption: "an Instagram caption: 2-4 short sentences then 3-6 relevant hashtags on the last line",
  product_description: "a product description: an opening sentence on the benefit, then 3-5 short bullet points of details, then one line on care or delivery only if given",
} as const;

async function writeCopy(ctx: PeggyToolContext, input: PeggyToolInput<"write_copy">): Promise<ToolOutput> {
  await meterExtra(ctx);
  const result = await aiText({
    fast: true,
    system: `You write marketing copy for ${ctx.store.name}, a small online shop in Nigeria. Warm, confident Nigerian English. No emojis unless it is a WhatsApp status (one at most). Never invent prices, discounts, materials or delivery times that you were not given.`,
    prompt: `Write ${COPY_BRIEF[input.kind]}.\nAbout: ${input.about}\nReturn only the copy.`,
  });
  if (!result) throw new ToolError("The writing service didn't answer. Write the copy yourself in your reply instead.");
  const label = input.kind.replace(/_/g, " ");
  const summary = `Wrote ${/^[aeiou]/.test(label) ? "an" : "a"} ${label}. Nothing in the shop was changed.`;
  await recordActivity(ctx, { type: "marketing", title: `Peggy wrote ${label}`, description: result.text.slice(0, 500), tool: "write_copy" });
  return { content: `${summary}\nThe copy (show it to the seller in full):\n${result.text}`, action: { summary } };
}

type Runner<N extends PeggyToolName> = (ctx: PeggyToolContext, input: PeggyToolInput<N>) => Promise<ToolOutput>;

export const PEGGY_TOOL_RUNNERS: { [N in PeggyToolName]: Runner<N> } = {
  sales_summary: salesSummary,
  list_orders: listOrders,
  get_order: getOrder,
  list_products: listProducts,
  list_customers: listCustomers,
  list_discounts: listDiscounts,
  create_discount: createDiscount,
  update_product: updateProduct,
  mark_order: markOrder,
  draft_blog_post: draftBlogPost,
  draft_broadcast: draftBroadcast,
  draft_ad: draftAd,
  write_copy: writeCopy,
  ...SETUP_TOOL_RUNNERS,
  ...INBOX_TOOL_RUNNERS,
  ...SOCIAL_TOOL_RUNNERS,
  ...REVIEWS_TOOL_RUNNERS,
  ...MARKETING_TOOL_RUNNERS,
  ...COMMERCE_TOOL_RUNNERS,
  ...CMS_TOOL_RUNNERS,
  ...EMAIL_TOOL_RUNNERS,
  ...LEGAL_TOOL_RUNNERS,
  ...PRODUCTS_TOOL_RUNNERS,
};

export const isWriteTool = (name: string) => name in PEGGY_TOOL_SPECS && PEGGY_TOOL_SPECS[name as PeggyToolName].write;
