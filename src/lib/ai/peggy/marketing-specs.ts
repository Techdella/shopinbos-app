// Peggy's marketing tools (segments, campaigns, automations, templates): input schemas. Pure, merged into
// PEGGY_TOOL_SPECS in ./pure. Anything that sends messages needs a confirmation code that the tool hands
// out with a preview; Peggy may only pass it back after the seller says yes.

import { z } from "zod";

const SEGMENT_FIELD_KEYS = ["spent", "orders", "last_order", "first_order", "location", "tag", "source", "product", "subscribed", "joined", "reachable"] as const;
const FLOW_KEYS = ["welcome", "abandoned_cart", "browse", "thank_you", "review", "win_back", "birthday"] as const;
const confirm = z
  .string()
  .trim()
  .max(12)
  .nullable()
  .describe("null on the first call. The tool then returns a preview and a confirmation code; ask the seller, and only after they clearly say yes call again with that code.");

export const MARKETING_TOOL_SPECS = {
  marketing_overview: {
    write: false,
    description:
      "The shop's marketing at a glance: subscriber counts, saved segments (with live sizes), recent campaigns (status, sends, opens, clicks, sales), automations (on/off, messages sent in 30 days), templates, and which channels (email, SMS, WhatsApp) can send.",
    schema: z.object({}).strict(),
  },
  marketing_create_segment: {
    write: true,
    description:
      "Save a customer segment from rules. Fields and ops: spent (gte|lte, naira), orders (gte|lte|eq), last_order (within_days|more_than_days|never, days), first_order (within_days|more_than_days), location (contains|not_contains, text like Lagos), tag (has|not_has), source (is|is_not: customer, newsletter_form, popup, checkout_optin, manual_import, csv_upload), product (bought|not_bought, product name or id), subscribed (is_true|is_false), joined (within_days|more_than_days), reachable (email|phone). Returns how many people match.",
    schema: z
      .object({
        name: z.string().trim().min(2).max(120),
        match: z.enum(["all", "any"]).describe("all = every rule must match; any = at least one"),
        conditions: z
          .array(
            z
              .object({
                field: z.enum(SEGMENT_FIELD_KEYS),
                op: z.string().trim().min(2).max(20),
                value: z.string().trim().max(160).nullable().describe("Number of naira/orders/days as digits, text, tag, source key or product name; null when the op needs none"),
              })
              .strict(),
          )
          .min(1)
          .max(10),
      })
      .strict(),
  },
  marketing_create_campaign: {
    write: true,
    description:
      "Save a campaign as a DRAFT (never sends). channel email, sms or whatsapp. Audience: a saved segment by name, or everyone/subscribers. For email, `message` becomes the email body (blank lines = paragraphs; {{name}} and {{store}} are filled in) and `subject` is required; for SMS/WhatsApp keep it short.",
    schema: z
      .object({
        channel: z.enum(["email", "sms", "whatsapp"]),
        name: z.string().trim().min(2).max(120),
        subject: z.string().trim().max(150).nullable().describe("Email subject; null for SMS/WhatsApp"),
        message: z.string().trim().min(5).max(5000),
        segment: z.string().trim().max(120).nullable().describe("Saved segment name, or null to use `audience`"),
        audience: z.enum(["all", "subscribers"]).nullable().describe("all = subscribers and past buyers; used when segment is null"),
      })
      .strict(),
  },
  marketing_send_campaign: {
    write: true,
    description:
      "Send a draft campaign now, or schedule it (when = ISO date-time, Lagos time if no zone). This messages real customers, so: call first with confirmCode null to get the audience size and a code, tell the seller exactly who gets what and when, and only call again with the code after they say yes.",
    schema: z
      .object({
        campaign: z.string().trim().min(1).max(160).describe("Campaign id or exact name"),
        when: z.string().trim().max(40).nullable().describe("null to send now, or a date-time to schedule"),
        confirmCode: confirm,
      })
      .strict(),
  },
  marketing_send_test: {
    write: true,
    description: "Send a test of a campaign to the seller only (their own email, or phone for SMS/WhatsApp). Customers get nothing.",
    schema: z.object({ campaign: z.string().trim().min(1).max(160).describe("Campaign id or exact name") }).strict(),
  },
  marketing_create_automation: {
    write: true,
    description:
      "Add a ready-made automation flow: welcome (series for new subscribers), abandoned_cart (reminders + WhatsApp + 10% code), browse (saved but didn't buy), thank_you (after payment), review (ask for a review 3 days after delivery), win_back (15% code after 90 quiet days), birthday (20% birthday code). It is created switched OFF; to switch it on now (it will then message customers automatically), set activate=true and follow the confirmation-code steps.",
    schema: z
      .object({
        flow: z.enum(FLOW_KEYS),
        activate: z.boolean(),
        confirmCode: confirm,
      })
      .strict(),
  },
  marketing_list_templates: {
    write: false,
    description: "The shop's saved email templates and the starter library (welcome, newsletter, sale, new arrivals, cart reminder, thank you, shipping, review request, win-back, birthday, Sallah, Christmas, Detty December, Valentine's, back in stock, event invite, announcement).",
    schema: z.object({}).strict(),
  },
} as const;
