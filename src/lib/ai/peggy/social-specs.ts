// Peggy's analytics and social selling tools: input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";
import { SHARE_CHANNEL_KEYS } from "../../social/share.ts";

export const SOCIAL_TOOL_SPECS = {
  analytics_report: {
    write: false,
    description:
      "The shop's analytics for a period (today, last 7, 30 or 90 days, Lagos time) against the period before: sales, paid orders, average order, store visits, conversion rate, returning customers, refunds, top products, sales by channel (WhatsApp, Instagram, in person…), visit sources, marketing attribution (email campaigns, ads, creators, discount codes) and the store funnel.",
    schema: z.object({ period: z.enum(["today", "7d", "30d", "90d"]) }).strict(),
  },
  store_traffic_report: {
    write: false,
    description:
      "How people find and use the online store for a period (today, last 7, 30 or 90 days, Lagos time) against the period before: visits, page views, daily visitors, new visitors, pages per visit, time on a page, top pages and landing pages, where visits came from (Google, Instagram, WhatsApp, direct, AI assistants like ChatGPT…), websites that sent people, devices, countries and cities, searches typed in the shop, products viewed → added to bag → ordered, the store funnel and conversion rate. Use it to explain the numbers on /home/analytics/traffic or why visits went up or down.",
    schema: z.object({ period: z.enum(["today", "7d", "30d", "90d"]) }).strict(),
  },
  social_write_post: {
    write: true,
    description:
      "Write a social post for one product on one app (whatsapp, instagram, facebook, x, tiktok) with its tagged product link, and give the shop's catalog feed URLs. Returns text only; nothing is posted. Show the post and link in full.",
    schema: z
      .object({
        productName: z.string().trim().min(1).max(160).describe("Product id or name"),
        channel: z.enum(SHARE_CHANNEL_KEYS),
        angle: z.string().trim().max(200).nullable().describe("Anything to mention (new arrival, weekend sale), or null"),
      })
      .strict(),
  },
} as const;
