// Peggy's review tools: input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";

const productRef = z.string().trim().min(1).max(160);
const reviewKey = z.string().trim().regex(/^(store|ext):[A-Za-z0-9_-]{1,64}$/, "Use the review key from reviews_list, like store:abc123");

export const REVIEW_MODERATE_MAX = 50;

export const REVIEWS_TOOL_SPECS = {
  reviews_summary: {
    write: false,
    description:
      "Reviews across every source (store, Google, WhatsApp/social screenshots, marketplaces): average, count, star distribution, response rate, how many wait for a reply or publishing, per-source numbers, and (when themes=true) what customers praise and complain about.",
    schema: z
      .object({
        themes: z.boolean().describe("true to also summarise what customers praise and complain about (uses AI)"),
        product: productRef.nullable().describe("One product's reviews (id or name); null for the whole shop"),
      })
      .strict(),
  },
  reviews_draft_replies: {
    write: false,
    description:
      "Draft public replies to reviews that have none yet (newest first). Returns the drafts as text with links; nothing is posted. The seller saves or edits them on each review's page.",
    schema: z
      .object({
        limit: z.number().int().min(1).max(5).nullable().describe("How many reviews (1-5); null for 3"),
        lowRatingsFirst: z.boolean().nullable().describe("true to start with 1-3 star reviews"),
        product: productRef.nullable().describe("Only this product's reviews (id or name); null for any"),
      })
      .strict(),
  },
  reviews_request: {
    write: true,
    description:
      "Ask buyers of recent paid or delivered orders to review them, with a review link. This really sends by email, SMS or WhatsApp (or makes links for the seller's own WhatsApp with channel=link). First call with confirmCode null to see who would be asked (nothing is sent) and tell the seller; only after they clearly say yes (in their next message) call again with the same orders, channel and that code.",
    schema: z
      .object({
        orderNumbers: z.array(z.string().trim().min(1).max(60)).max(50).nullable().describe("Specific order numbers; null for delivered orders from the last 30 days that were never asked"),
        channel: z.enum(["email", "sms", "whatsapp", "link"]),
        confirmCode: z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller approved sending to exactly these buyers"),
      })
      .strict(),
  },
  reviews_list: {
    write: false,
    description:
      "List reviews with their key, stars, customer, text, product, status (Published, Waiting, Hidden), featured and the seller's reply. Filter by product and by: all, needs_reply (no reply yet), waiting (not published yet), low_rating (1-3 stars), featured, hidden.",
    schema: z
      .object({
        product: productRef.nullable().describe("Product id or name; null for every product"),
        filter: z.enum(["all", "needs_reply", "waiting", "low_rating", "featured", "hidden"]),
        limit: z.number().int().min(1).max(30).nullable().describe("How many (1-30); null for 10"),
      })
      .strict(),
  },
  reviews_reply: {
    write: true,
    description:
      "Post the seller's public reply under one review (store reviews show it on the store; connected Google reviews get it on Google too). An empty reply deletes the current one. First call with confirmCode null: it shows the exact reply and gives a code; only after the seller says yes to those exact words call again with the same text and the code.",
    schema: z
      .object({
        review: reviewKey,
        reply: z.string().trim().max(4000).describe("The exact reply text; \"\" deletes the reply"),
        confirmCode: z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller approved these words"),
      })
      .strict(),
  },
  reviews_moderate: {
    write: true,
    description: `Publish (approve), move to waiting, hide (reject), feature or unfeature up to ${REVIEW_MODERATE_MAX} reviews by their keys from reviews_list. Featuring also publishes. First call with confirmCode null to get the list and a code; only after the seller says yes call again with the same reviews, action and the code.`,
    schema: z
      .object({
        reviews: z.array(reviewKey).min(1).max(REVIEW_MODERATE_MAX),
        action: z.enum(["publish", "wait", "hide", "feature", "unfeature"]),
        confirmCode: z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller says yes"),
      })
      .strict(),
  },
} as const;
