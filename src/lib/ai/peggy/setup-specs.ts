// Peggy's shop-setup tools (Start here): input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";

export const SETUP_TOOL_SPECS = {
  setup_status: {
    write: false,
    description:
      "The seller's Start here checklist: which setup steps are done, skipped or still open (look, products with photos, payment methods, delivery areas, payout bank, going live, sharing the link, domain, subscribers), plus the current payment methods and delivery areas.",
    schema: z.object({}).strict(),
  },
  setup_payment_methods: {
    write: true,
    description:
      "Turn ways customers can pay at checkout on or off: transfer (bank transfer to the payout account), card (card and USSD through Paystack), cod (pay on delivery), wa (finish the order on WhatsApp). Only the methods given change; null keeps a method as it is. At least one must stay on.",
    schema: z
      .object({
        transfer: z.boolean().nullable().describe("Bank transfer on/off, or null to keep"),
        card: z.boolean().nullable().describe("Card and USSD (Paystack) on/off, or null to keep"),
        cod: z.boolean().nullable().describe("Pay on delivery on/off, or null to keep"),
        wa: z.boolean().nullable().describe("Finish on WhatsApp on/off, or null to keep"),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (Object.values(value).every((on) => on === null)) ctx.addIssue({ code: "custom", message: "Say which payment method to turn on or off" });
      }),
  },
  setup_delivery_area: {
    write: true,
    description:
      "Add a delivery area with a flat fee, or update the area with the same name. regions lists the cities, states or neighbourhoods it covers (checkout matches them against the customer's city and state); an empty list means everywhere else and is always checked last.",
    schema: z
      .object({
        name: z.string().trim().min(2).max(80).describe("Area name the seller will recognise, e.g. Lagos Mainland or Everywhere else"),
        fee: z.number().int().min(0).max(1_000_000).describe("Delivery fee in naira"),
        regions: z.array(z.string().trim().min(2).max(60)).max(30).describe("Cities, states or areas covered; [] for everywhere else"),
      })
      .strict(),
  },
} as const;
