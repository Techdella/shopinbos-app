// Peggy's ad tools: campaigns on Facebook & Instagram (the seller's own Meta ad account) and requests for the
// Shopinbos team to run TikTok or Meta ads. Input schemas only; merged into PEGGY_TOOL_SPECS in ./pure.
// Drafting is free; launching or resuming spends the seller's money, so it needs a confirmation code the tool
// hands out with a preview, passed back only after the seller says yes.

import { z } from "zod";
import { AD_OBJECTIVES, NG_STATES } from "../../../../shared/ad-campaigns.ts";

const confirm = z
  .string()
  .trim()
  .max(12)
  .nullable()
  .describe("null on the first call. The tool returns a preview and a confirmation code; ask the seller, and only after they clearly say yes call again with that code.");

const campaign = z.string().trim().min(1).max(160).describe("Campaign name or id (from ads_overview)");

export const ADS_TOOL_SPECS = {
  ads_overview: {
    write: false,
    description:
      "The shop's ads: whether Meta ads (Facebook & Instagram) are connected and on which ad account, every campaign (status, budget, spend, impressions, link taps, orders, any error from Facebook), and requests to the Shopinbos ads team (TikTok or Meta) with their status.",
    schema: z.object({}).strict(),
  },
  ads_create_campaign: {
    write: true,
    description:
      "Save an ad campaign as a DRAFT (spends nothing): one or more products, each with its photo (and optionally a saved video from the video studio), with ad words Peggy writes. mode meta = runs on the seller's own Facebook & Instagram ad account (launch it with ads_launch_campaign); mode managed = the Shopinbos team runs it on TikTok or Meta after the seller pays the setup fee (then use ads_request_help).",
    schema: z
      .object({
        products: z.array(z.string().trim().min(1).max(160)).min(1).max(20).describe("Product names or ids"),
        mode: z.enum(["meta", "managed"]),
        platform: z.enum(["meta", "tiktok"]).nullable().describe("For managed: tiktok or meta; null for meta"),
        objective: z.enum(AD_OBJECTIVES).nullable().describe("traffic = visits to product pages, whatsapp = WhatsApp chats, awareness = get seen; null for traffic"),
        dailyBudget: z.number().min(500).max(10_000_000).nullable().describe("Per day in the ad account's currency (naira for most); null for 5000"),
        days: z.number().int().min(1).max(90).nullable().describe("How long; null for 7"),
        startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe("YYYY-MM-DD; null for today"),
        states: z.array(z.enum(NG_STATES)).max(37).nullable().describe("Nigerian states to show it in; null for all of Nigeria"),
        ageMin: z.number().int().min(18).max(65).nullable(),
        ageMax: z.number().int().min(18).max(65).nullable(),
        gender: z.enum(["all", "women", "men"]).nullable(),
        interests: z.array(z.string().trim().min(2).max(60)).max(10).nullable().describe("Plain words like fashion or skincare; null for none"),
        video: z.string().trim().max(160).nullable().describe("A saved video's title or id from the video studio to add as a video ad; null for none"),
        name: z.string().trim().max(120).nullable().describe("Campaign name; null to name it after the products"),
      })
      .strict(),
  },
  ads_launch_campaign: {
    write: true,
    description: "Launch a draft Meta campaign on the seller's own Facebook & Instagram ad account (Meta then charges their card for the ad spend). Needs Meta ads connected.",
    schema: z.object({ campaign, confirmCode: confirm }).strict(),
  },
  ads_manage_campaign: {
    write: true,
    description: "Pause, resume or end a running Meta campaign, or refresh its numbers. Resuming spends money again, so it needs a confirmation code.",
    schema: z.object({ campaign, action: z.enum(["pause", "resume", "end", "sync"]), confirmCode: confirm }).strict(),
  },
  ads_request_help: {
    write: true,
    description:
      "Ask the Shopinbos ads team to set up and run a TikTok or Meta campaign for the seller. Uses the seller's name, phone and email from their account; returns a Paystack link for the one-off setup fee (the request reaches the team once it's paid). The ad budget itself is paid to TikTok or Meta.",
    schema: z
      .object({
        platform: z.enum(["tiktok", "meta"]),
        campaign: z.string().trim().max(160).nullable().describe("A draft campaign (from ads_create_campaign) to attach; null for none"),
        handle: z.string().trim().max(120).nullable().describe("TikTok or Instagram handle; null if unknown"),
        pageUrl: z.string().trim().max(300).nullable().describe("TikTok profile or Facebook Page link; null if unknown"),
        dailyBudget: z.number().min(0).max(10_000_000).nullable().describe("Naira per day they plan to spend; null for 5000"),
        days: z.number().int().min(1).max(90).nullable(),
        goals: z.string().trim().max(1000).nullable(),
        notes: z.string().trim().max(2000).nullable(),
      })
      .strict(),
  },
} as const;
