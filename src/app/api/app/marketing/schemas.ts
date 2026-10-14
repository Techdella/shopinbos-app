import { z } from "zod";

// Request bodies for /api/app/marketing/**. Deep validation (segment rules, flow steps) happens in
// src/lib/marketing, which drops anything it doesn't understand.

export const RulesSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  conditions: z
    .array(z.object({ field: z.string().max(40), op: z.string().max(40), value: z.union([z.string().max(200), z.number()]).nullable().optional(), label: z.string().max(200).nullable().optional() }))
    .max(20),
});

export const SegmentSchema = z.object({
  name: z.string().trim().min(1, "Give the segment a name").max(120),
  description: z.string().max(500).nullable().optional(),
  rules: RulesSchema,
});

export const AudienceSchema = z.union([
  z.object({ mode: z.literal("all") }),
  z.object({ mode: z.literal("subscribers") }),
  z.object({ mode: z.literal("min_orders"), value: z.number().min(1) }),
  z.object({ mode: z.literal("min_spend"), value: z.number().min(0) }),
  z.object({ mode: z.literal("specific"), emails: z.array(z.string().max(200)).max(5000) }),
]);

export const ChannelSchema = z.enum(["email", "sms", "whatsapp"]);

export const CampaignSchema = z.object({
  name: z.string().trim().min(1, "Give the campaign a name").max(120),
  channel: ChannelSchema.optional(),
  subject: z.string().max(200).optional(),
  preheader: z.string().max(200).nullable().optional(),
  bodyHtml: z.string().max(200_000).optional(),
  templateId: z.string().max(64).nullable().optional(),
  segmentId: z.string().max(64).nullable().optional(),
  audience: AudienceSchema.optional(),
  campaignType: z.string().max(40).optional(),
  channelConfig: z
    .object({
      senderId: z.string().trim().max(11).nullable().optional(),
      templateId: z.string().max(64).nullable().optional(),
      variables: z.array(z.string().max(40)).max(20).optional(),
      headerImageUrl: z.string().trim().max(1000).regex(/^(https:\/\/\S+)?$/, "The header image must be an https:// link").nullable().optional(),
      productId: z.string().max(64).nullable().optional(),
      discountCode: z.string().trim().max(40).nullable().optional(),
    })
    .optional(),
});

const TemplateContentSchema = z.object({
  header: z.object({ format: z.enum(["NONE", "TEXT", "IMAGE"]), text: z.string().max(60).optional() }),
  body: z.string().trim().min(1, "Write the message").max(1024),
  footer: z.string().max(60).optional(),
  buttons: z.array(z.object({ type: z.enum(["URL", "QUICK_REPLY"]), text: z.string().trim().min(1).max(25), url: z.string().max(2000).optional() })).max(3).default([]),
});

export const WhatsAppTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name the template").max(512),
  language: z.string().max(10).default("en"),
  category: z.enum(["MARKETING", "UTILITY"]),
  content: TemplateContentSchema,
  variables: z.array(z.string().max(40)).max(20).default([]),
});

const EventSettingSchema = z.object({
  whatsapp: z.boolean().optional(),
  sms: z.boolean().optional(),
  templateId: z.string().max(64).nullable().optional(),
  smsText: z.string().max(480).optional(),
});

export const MessagingSettingsSchema = z.object({
  smsSenderId: z.string().trim().max(11).nullable().optional(),
  smsCostPerSegment: z.number().min(0).max(1_000_000).nullable().optional(),
  transactional: z
    .object({ order_confirmed: EventSettingSchema, payment_received: EventSettingSchema, order_shipped: EventSettingSchema, order_delivered: EventSettingSchema, abandoned_cart: EventSettingSchema })
    .partial()
    .optional(),
});

export const FlowSchema = z.object({
  presetKey: z.string().max(40).optional(),
  name: z.string().max(80).optional(),
  description: z.string().max(300).optional(),
  trigger: z
    .enum(["welcome_email", "abandoned_checkout", "browse_abandonment", "order_placed", "payment_received", "order_shipped", "order_delivered", "post_purchase", "review_request", "win_back", "birthday", "new_customer"])
    .optional(),
  steps: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
  settings: z.object({ days: z.number().int().min(1).max(3650).optional() }).optional(),
  active: z.boolean().optional(),
});

export const TemplateSchema = z.object({
  id: z.string().max(64).nullable().optional(),
  name: z.string().trim().min(1, "Give the template a name").max(120),
  subject: z.string().trim().min(1, "Add a subject").max(200),
  bodyHtml: z.string().max(200_000),
  category: z.string().max(40).optional(),
  preheader: z.string().max(200).nullable().optional(),
});

export const DiscountSchema = z.object({
  name: z.string().trim().min(1, "Give the discount a name").max(120),
  code: z.string().trim().max(40).optional(),
  type: z.enum(["percentage", "fixed_amount", "free_shipping", "bogo"]),
  value: z.number().min(0).max(100_000_000),
  minOrder: z.number().min(0).nullable().optional(),
  maxUses: z.number().int().min(0).nullable().optional(),
  startsAt: z.string().max(40).nullable().optional(),
  expiresAt: z.string().max(40).nullable().optional(),
  status: z.enum(["draft", "active", "disabled"]).optional(),
  config: z
    .object({
      automatic: z.boolean().optional(),
      buyQuantity: z.number().int().min(1).max(100).optional(),
      getQuantity: z.number().int().min(1).max(100).optional(),
      getPercent: z.number().min(1).max(100).nullable().optional(),
      productIds: z.array(z.string().max(64)).max(200).optional(),
      segmentId: z.string().max(64).nullable().optional(),
      oncePerCustomer: z.boolean().optional(),
    })
    .optional(),
});

const FieldSchema = z.object({
  key: z.string().trim().min(1).max(40),
  type: z.enum(["text", "email", "phone", "textarea", "select", "checkbox", "radio", "birthday"]),
  label: z.string().max(120),
  required: z.boolean().default(false),
  options: z.array(z.string().max(80)).max(20).optional(),
});

export const FormSchema = z.object({
  name: z.string().trim().min(1, "Give the form a name").max(120),
  type: z.enum(["newsletter", "contact", "lead", "custom", "request_quote", "waitlist", "product_inquiry", "wholesale_inquiry", "support", "popup"]).default("newsletter"),
  isPopup: z.boolean().default(false),
  active: z.boolean().default(true),
  fields: z.array(FieldSchema).max(15).default([]),
  design: z
    .object({
      headline: z.string().max(120).optional(),
      body: z.string().max(400).optional(),
      buttonText: z.string().max(40).optional(),
      successMessage: z.string().max(300).optional(),
      imageUrl: z.string().max(1000).optional(),
      consentText: z.string().max(400).optional(),
      askSmsConsent: z.boolean().optional(),
      // How the pop-up looks (template, colours, corners, font, picture, size, overlay, close button).
      style: z
        .object({
          template: z.enum(["classic", "split", "takeover", "corner", "badge", "minimal", "luxe", "festive"]).optional(),
          background: z.string().max(9).optional(),
          text: z.string().max(9).optional(),
          button: z.string().max(9).optional(),
          buttonText: z.string().max(9).optional(),
          radius: z.enum(["square", "soft", "round"]).optional(),
          font: z.enum(["theme", "modern", "elegant", "clean"]).optional(),
          imagePosition: z.enum(["left", "top", "background", "none"]).optional(),
          size: z.enum(["small", "medium", "large"]).optional(),
          overlay: z.number().int().min(0).max(90).optional(),
          closeStyle: z.enum(["icon", "circle", "text"]).optional(),
          badgeText: z.string().max(24).optional(),
        })
        .optional(),
    })
    .default({}),
  popupConfig: z
    .object({
      layout: z.enum(["modal", "flyout", "bar", "fullscreen"]).default("modal"),
      trigger: z.enum(["immediate", "delay", "exit_intent", "scroll"]).default("delay"),
      delaySeconds: z.number().int().min(0).max(600).default(8),
      scrollPercent: z.number().int().min(5).max(100).default(50),
      pages: z.enum(["all", "home", "product"]).default("all"),
      frequency: z.enum(["once", "session", "always", "days"]).default("once"),
      frequencyDays: z.number().int().min(1).max(365).default(7),
      devices: z.array(z.enum(["mobile", "desktop"])).min(1).default(["mobile", "desktop"]),
      // Sign-up reward: the store's own code, or one made here (shared, or one-use per person). See lib/marketing/popup-rewards.
      reward: z
        .object({
          source: z.enum(["new", "existing"]).default("new"),
          type: z.enum(["percentage", "fixed_amount", "free_shipping", "bogo"]).default("percentage"),
          value: z.number().min(0).max(10_000_000).default(0),
          days: z.number().int().min(0).max(365).default(0),
          minOrder: z.number().min(0).max(100_000_000).default(0),
          unique: z.boolean().default(true),
          discountId: z.string().max(64).nullable().optional(),
          code: z.string().trim().max(40).optional(),
          prefix: z.string().trim().max(12).optional(),
        })
        .nullable()
        .optional(),
      afterSubmit: z.enum(["message", "redirect"]).default("message"),
      redirectUrl: z.string().max(1000).optional(),
    })
    .default({ layout: "modal", trigger: "delay", delaySeconds: 8, scrollPercent: 50, pages: "all", frequency: "once", frequencyDays: 7, devices: ["mobile", "desktop"], afterSubmit: "message" }),
});
