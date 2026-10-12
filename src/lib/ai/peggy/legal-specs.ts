// Peggy's legal page tool: input schema. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";

export const LEGAL_PAGE_KEYS = ["privacy-policy", "terms-of-service", "refund-policy", "shipping-policy", "cookie-policy", "contact-information"] as const;

export const LEGAL_TOOL_SPECS = {
  legal_draft_page: {
    write: true,
    description:
      "Write one of the store's legal pages (privacy-policy, terms-of-service, refund-policy = returns and refunds, shipping-policy = delivery, cookie-policy, contact-information) from what the shop's settings say, and save it as an UNPUBLISHED draft for the seller to review at /home/legal/<page>. Never publishes, and won't touch a page that is already live. Saving replaces the page's current draft text, so: call first with confirmCode null to get a code, tell the seller, and only call again with the code after they say yes.",
    schema: z
      .object({
        page: z.enum(LEGAL_PAGE_KEYS),
        brief: z.string().trim().max(1000).nullable().describe("Anything the seller said to include (return window, who pays return delivery…), or null"),
        confirmCode: z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller says yes"),
      })
      .strict(),
  },
} as const;
