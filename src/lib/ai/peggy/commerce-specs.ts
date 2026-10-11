// Peggy's bag, wishlist and checkout tools: input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";

export const COMMERCE_TOOL_SPECS = {
  commerce_abandoned_carts: {
    write: false,
    description:
      "Carts shoppers left at checkout after giving an email or phone (last 30 days): how many are waiting and recovered with their value, and the most recent ones with what's in them, the step they left at, reminders sent and a link that restores that bag for the shopper.",
    schema: z.object({ limit: z.number().int().min(1).max(20).nullable().describe("How many recent carts to list (1-20); null for 5") }).strict(),
  },
  commerce_update_settings: {
    write: true,
    description:
      "Change how the bag and checkout work in the store: what happens after Add to bag, wishlists on/off, and checkout options (phone required, discount code box, order notes, gift messages, secure-checkout line, add-ons at checkout). Only pass what the seller asked to change; null leaves a setting as it is.",
    schema: z
      .object({
        afterAdd: z.enum(["drawer", "cart_page", "checkout"]).nullable().describe("drawer = open the quick bag, cart_page = go to the bag page, checkout = go straight to checkout"),
        wishlist: z.boolean().nullable(),
        requirePhone: z.boolean().nullable(),
        enableCoupon: z.boolean().nullable(),
        enableNotes: z.boolean().nullable(),
        enableGiftNote: z.boolean().nullable(),
        enableTrustBadges: z.boolean().nullable(),
        enableUpsells: z.boolean().nullable(),
      })
      .strict(),
  },
} as const;
