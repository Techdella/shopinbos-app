// Peggy's payment link and link in bio tools: input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";
import { EXPIRY_CHOICES, MAX_LINK_ITEMS, MAX_LINK_QUANTITY } from "../../payment-links/pure.ts";

const confirmCode = z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller says yes in their next message");

export const PAYLINKS_TOOL_SPECS = {
  create_payment_link: {
    write: true,
    description:
      "Make a payment link for products in the shop that a customer can open from WhatsApp, Instagram or TikTok and pay for (card, transfer or pay on delivery, as the shop allows), with delivery worked out on the page. Call first with confirmCode null: nothing is made and you get a preview and a confirmation code. Show the seller the preview, and only after they clearly say yes (in their next message) call again with the same details and that code. Then give the seller the link to send.",
    schema: z
      .object({
        products: z
          .array(
            z
              .object({
                product: z.string().trim().min(1).max(160).describe("Product id or name"),
                option: z.string().trim().max(120).nullable().describe("The size/colour option by name (e.g. 'L / Red'), or null to let the customer choose"),
                quantity: z.number().int().min(1).max(MAX_LINK_QUANTITY),
              })
              .strict(),
          )
          .min(1)
          .max(MAX_LINK_ITEMS),
        oneTime: z.boolean().describe("true = closes once paid (for one customer); false = reusable"),
        expiry: z.enum(EXPIRY_CHOICES).nullable().describe("How long it stays open; null for 7 days"),
        customAmount: z.number().positive().max(100_000_000).nullable().describe("A price the seller agreed for these items in naira (before delivery), or null for the shop prices"),
        note: z.string().trim().max(500).nullable().describe("A short note shown on the page, or null"),
        buyerName: z.string().trim().max(120).nullable(),
        buyerPhone: z.string().trim().max(40).nullable(),
        buyerEmail: z.string().trim().max(200).nullable(),
        confirmCode,
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.buyerEmail && !z.string().email().safeParse(value.buyerEmail).success) ctx.addIssue({ code: "custom", message: "That email doesn't look right", path: ["buyerEmail"] });
      }),
  },
  list_payment_links: {
    write: false,
    description: "The shop's payment links, newest first: what each is for, amount, status (active, paid, expired, cancelled), who made it (the seller, Peggy, a customer chat, link in bio), views and the order that paid it.",
    schema: z
      .object({
        status: z.enum(["active", "paid", "expired", "cancelled"]).nullable().describe("Only links with this status, or null for all"),
        limit: z.number().int().min(1).max(30).nullable().describe("How many (1-30); null for 10"),
      })
      .strict(),
  },
  cancel_payment_link: {
    write: true,
    description: "Cancel an unpaid payment link so it can't be paid any more. Call first with confirmCode null to get a confirmation code; only after the seller says yes call again with that code.",
    schema: z.object({ link: z.string().trim().min(1).max(300).describe("The link's code, id or full address"), confirmCode }).strict(),
  },
  build_link_in_bio: {
    write: true,
    description:
      "Build or replace the shop's link in bio page (https://<shop>/links, for the Instagram or TikTok bio): the top products as cards (the first a big Buy now button that opens a payment link), a WhatsApp chat button, social profile links and an optional email sign-up. Call first with confirmCode null for a preview and a confirmation code; only after the seller says yes call again with the same details and that code. It replaces the blocks already on the page.",
    schema: z
      .object({
        products: z.array(z.string().trim().min(1).max(160)).max(12).nullable().describe("Product names or ids to show, or null for the best sellers"),
        productCount: z.number().int().min(1).max(12).nullable().describe("How many best sellers when products is null; null for 5"),
        whatsapp: z.boolean().describe("Add a WhatsApp chat button with the shop's number"),
        socials: z
          .object({
            instagram: z.string().trim().max(120).nullable(),
            tiktok: z.string().trim().max(120).nullable(),
            x: z.string().trim().max(120).nullable(),
            facebook: z.string().trim().max(120).nullable(),
            youtube: z.string().trim().max(120).nullable(),
          })
          .strict()
          .describe("Handles or links the seller gave; null for ones they didn't"),
        buyNow: z.boolean().describe("Make the first product a big Buy now button"),
        signup: z.boolean().describe("Add an email sign-up box"),
        bio: z.string().trim().max(300).nullable().describe("A short line under the shop name, or null to keep it"),
        confirmCode,
      })
      .strict(),
  },
} as const;
