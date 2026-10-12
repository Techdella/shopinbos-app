// Peggy's email template tools: input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure. Both save a new
// DRAFT template (nothing is sent, nothing existing is overwritten); the seller opens it in the builder.

import { z } from "zod";

const KINDS = ["welcome", "newsletter", "promotion", "product_launch", "abandoned_cart", "order", "shipping", "review", "win_back", "birthday", "festive", "restock", "event", "announcement"] as const;

export const EMAIL_TOOL_SPECS = {
  draft_email_template: {
    write: true,
    description:
      "Write a designed email (heading, text, photo, the shop's real products and prices, discount code box, button) and save it as a NEW DRAFT template in Marketing > Email templates. Never sends. Use for requests like 'write a Sallah sale email' or 'make me a welcome email'. The seller can then edit it in the visual builder, send themselves a test, or use it in a campaign.",
    schema: z
      .object({
        brief: z.string().trim().min(3).max(1000).describe("What the email is for and anything to include (occasion, offer, discount code, products to feature, tone)"),
        name: z.string().trim().max(120).nullable().describe("Template name, or null to choose one"),
        kind: z.enum(KINDS).nullable().describe("The kind of email, or null to guess"),
      })
      .strict(),
  },
  improve_email_copy: {
    write: true,
    description:
      "Rewrite one of the shop's saved email templates as the seller asks (shorter, warmer, better subject line, add best sellers…) and save the result as a NEW draft copy named '<name> (Peggy's edit)'. The original is left exactly as it was. Never sends.",
    schema: z
      .object({
        template: z.string().trim().min(1).max(160).describe("Saved template id or name (marketing_list_templates shows the names)"),
        instruction: z.string().trim().min(3).max(1000).describe("What to change"),
      })
      .strict(),
  },
} as const;
