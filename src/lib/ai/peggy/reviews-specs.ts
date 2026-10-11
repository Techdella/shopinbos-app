// Peggy's review tools: input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";

export const REVIEWS_TOOL_SPECS = {
  reviews_summary: {
    write: false,
    description:
      "Reviews across every source (store, Google, WhatsApp/social screenshots, marketplaces): average, count, star distribution, response rate, how many wait for a reply or publishing, per-source numbers, and (when themes=true) what customers praise and complain about.",
    schema: z.object({ themes: z.boolean().describe("true to also summarise what customers say (uses AI)") }).strict(),
  },
  reviews_draft_replies: {
    write: false,
    description:
      "Draft public replies to reviews that have none yet (newest first). Returns the drafts as text with links; nothing is posted. The seller saves or edits them on each review's page.",
    schema: z.object({ limit: z.number().int().min(1).max(5).nullable().describe("How many reviews (1-5); null for 3"), lowRatingsFirst: z.boolean().nullable().describe("true to start with 1-3 star reviews") }).strict(),
  },
  reviews_request: {
    write: true,
    description:
      "Ask buyers of recent paid or delivered orders to review them, with a review link. This really sends by email, SMS or WhatsApp (or makes links for the seller's own WhatsApp with channel=link). First call with confirmed=false to see who would be asked and say it to the seller; call again with confirmed=true only after the seller clearly says yes.",
    schema: z
      .object({
        orderNumbers: z.array(z.string().trim().min(1).max(60)).max(50).nullable().describe("Specific order numbers; null for delivered orders from the last 30 days that were never asked"),
        channel: z.enum(["email", "sms", "whatsapp", "link"]),
        confirmed: z.boolean().describe("true only after the seller approved sending to exactly these buyers"),
      })
      .strict(),
  },
} as const;
