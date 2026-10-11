import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { aiText } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { loadAnalytics } from "@/lib/analytics/load";
import { resolveRange } from "@/lib/analytics/range";
import { feedUrl, productLink } from "@/lib/social/server";
import { SHARE_CHANNELS, captionRoom, fallbackCaption, fitCaption, postText, taggedProductLink } from "@/lib/social/share";
import { naira } from "@shared/onboarding";
import { matchProducts, type PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy's analytics and social selling tools. Same numbers as /home/analytics and the same links as /channels.

const pct = (value: number | null) => (value == null ? null : `${Math.round(value * 1000) / 10}%`);

async function analyticsReport(ctx: PeggyToolContext, input: PeggyToolInput<"analytics_report">): Promise<ToolOutput> {
  const range = resolveRange({ range: input.period });
  const { report } = await loadAnalytics(ctx.store.id, range);
  const k = report.kpis;
  return {
    content: JSON.stringify({
      period: range.label,
      sales: naira(k.sales),
      paidOrders: k.orders,
      averageOrder: naira(k.aov),
      storeVisits: k.visits,
      conversionRate: pct(k.conversionRate),
      returningCustomerRate: pct(k.returningRate),
      refundedOrCancelled: { orders: k.refundsCount, value: naira(k.refundsValue) },
      changeVsPeriodBeforePercent: report.change,
      previous: { sales: naira(report.previous.sales), paidOrders: report.previous.orders, visits: report.previous.visits },
      topProducts: report.topProducts.slice(0, 5).map((p) => ({ name: p.name, sold: p.quantity, sales: naira(p.sales), views: p.views })),
      channels: report.channels.map((c) => ({ channel: c.label, paidOrders: c.orders, sales: naira(c.sales), visits: c.visits })),
      visitSources: report.sources.slice(0, 6).map((s) => ({ source: s.label, visits: s.visits })),
      attribution: Object.fromEntries(Object.entries(report.attribution).map(([key, rows]) => [key, rows.slice(0, 5).map((r) => ({ name: r.label, paidOrders: r.orders, sales: naira(r.sales) }))])),
      funnel: report.funnel.map((s) => ({ step: s.label, count: s.count })),
      newVsReturning: report.customers,
      seeAlso: "/home/analytics",
    }),
  };
}

async function socialWritePost(ctx: PeggyToolContext, input: PeggyToolInput<"social_write_post">): Promise<ToolOutput> {
  const store = await db.store.findUnique({ where: { id: ctx.store.id }, select: { slug: true, customDomain: true } });
  const products = await db.storeProduct.findMany({
    where: { storeId: ctx.store.id, status: "published" },
    take: 1000,
    select: { id: true, name: true, description: true, retailPrice: true, currentStock: true },
  });
  const matches = matchProducts(products, input.productName);
  if (!store || !matches.length) throw new ToolError(`No published product matches "${input.productName}". Use list_products to find it (drafts can't be shared).`);
  if (matches.length > 1) throw new ToolError(`"${input.productName}" matches ${matches.length} products: ${matches.slice(0, 6).map((p) => `${p.name} (id ${p.id})`).join("; ")}. Ask which one.`);
  const product = matches[0];
  if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance. It resets within 24 hours.");

  const spec = SHARE_CHANNELS.find((item) => item.key === input.channel)!;
  const link = taggedProductLink(productLink(store, product.id), input.channel);
  const price = naira(product.retailPrice);
  const room = captionRoom(input.channel, link);
  const result = await aiText({
    fast: true,
    system: `You write social posts for ${ctx.store.name}, a small online shop in Nigeria. Warm, confident Nigerian English. Never invent prices, discounts, materials or delivery times.`,
    prompt: `Write a ${spec.label} post under ${Math.max(60, room)} characters for: ${product.name}, ${price}.${product.description ? ` Details: ${product.description.replace(/<[^>]*>/g, " ").slice(0, 500)}` : ""}${input.angle ? ` Mention: ${input.angle}.` : ""} Don't include a link. Return only the post text.`,
  });
  const caption = fitCaption(result?.text.trim() || fallbackCaption({ name: product.name, price, storeName: ctx.store.name }, input.channel), room);
  const post = postText(input.channel, caption, link);
  const summary = `Wrote a ${spec.label} post for ${product.name}. Nothing was posted.`;
  await db.activityEvent
    .create({ data: { storeId: ctx.store.id, userId: ctx.userId, type: "marketing", title: `Peggy wrote a ${spec.label} post`, description: post.slice(0, 500), metadata: { source: "peggy", tool: "social_write_post", link: "/channels" } as Prisma.InputJsonValue } })
    .catch((error) => console.error("[peggy] activity log failed", error));
  return {
    content: [
      summary,
      `Post (show it in full):\n${post}`,
      `Tagged link (orders from it count under ${spec.label}): ${link}`,
      `Catalog feeds for listing every product: Google ${feedUrl(store.slug, "google.xml")}, Facebook/Instagram ${feedUrl(store.slug, "meta.csv")}, TikTok ${feedUrl(store.slug, "tiktok.csv")}, WhatsApp ${feedUrl(store.slug, "whatsapp.csv")}. Setup steps are on /channels.`,
    ].join("\n"),
    action: { summary, href: "/channels" },
  };
}

export const SOCIAL_TOOL_RUNNERS = {
  analytics_report: analyticsReport,
  social_write_post: socialWritePost,
};
