// The WhatsApp side of the launch: the message templates Meta has to approve, and the three WhatsApp sequences
// (sellers, suppliers, delivery partners) that send them. Pure, unit-tested in tests/lead-growth.test.mjs.
//
// WhatsApp only lets a business start a chat with an approved template, so every step here is a template. Each one
// has two variables: {{1}} the lead's first name ("there" when we don't know it) and {{2}} their personal opt-out
// link. Meta doesn't allow a variable at the very start or end of the text, so both sit mid-sentence.
//
// The sequences are lighter than email (WhatsApp is more personal): a welcome an hour after the lead comes in, the
// moments that matter (registration opening on 22 October for partners, launch on 1 November) and one reminder.
// They go out at 10:00 Lagos, an hour after the matching email. They come in switched off: turn them on in
// Admin › Leads › WhatsApp once Meta has approved the templates.

import { LAUNCH_AT, PARTNER_REGISTRATION_AT } from "./launch-sequences.ts";
import type { LeadAudienceType, LeadRole, LeadStepType } from "./pure.ts";

const APP = "https://app.shopinbos.com";
const SITE = "https://shopinbos.com";
const CATCH_UP_UNTIL = "2026-12-31T23:00:00+01:00";

export type WhatsAppTemplate = {
  /** Meta template name: lower case, digits and _. */
  name: string;
  role: LeadRole;
  /** What it's for, shown in the admin list. */
  purpose: string;
  /** Meta category. Launch updates and nudges are marketing. */
  category: "MARKETING" | "UTILITY";
  language: string;
  /** Body with {{1}} (first name) and {{2}} (opt-out link). */
  body: string;
  button: { text: string; url: string };
};

const optOut = "If you'd rather not get these messages, open {{2}} to stop them.";

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  // ─── Sellers ───
  {
    name: "sib_seller_welcome",
    role: "seller",
    purpose: "Welcome, right after joining the waitlist",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, thanks for joining the Shopinbos waitlist! 🎉\n\nWe open on Sunday 1 November. Chip, our AI, will build your online store in about 5 minutes, and you can sell products from verified suppliers without holding stock.\n\nWe'll message you here the moment we're live. ${optOut}`,
    button: { text: "See what's coming", url: SITE },
  },
  {
    name: "sib_seller_live",
    role: "seller",
    purpose: "Launch day: Shopinbos is live",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, Shopinbos is live! 🚀\n\nCreate your account, tell Chip what you sell, and your online store will be ready in about 5 minutes. It's free to start.\n\n${optOut}`,
    button: { text: "Create my store", url: `${APP}/signup?utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=launch` },
  },
  {
    name: "sib_seller_reminder",
    role: "seller",
    purpose: "Reminder a few days after launch",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, your Shopinbos store is still waiting for you.\n\nIt takes about 5 minutes to set up, and you'll have a link to share with your customers on WhatsApp and Instagram. Reply here if you'd like a hand getting started.\n\n${optOut}`,
    button: { text: "Create my store", url: `${APP}/signup?utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=launch-reminder` },
  },
  // ─── Suppliers ───
  {
    name: "sib_supplier_welcome",
    role: "supplier",
    purpose: "Welcome, right after joining as a supplier",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, thanks for your interest in supplying on Shopinbos!\n\nSupplier registration opens on Thursday 22 October, ten days before we launch to sellers. We'll send you the link here that morning, so your products are ready in the marketplace on day one.\n\n${optOut}`,
    button: { text: "See how it works", url: SITE },
  },
  {
    name: "sib_supplier_registration_open",
    role: "supplier",
    purpose: "22 October: supplier registration is open",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, supplier registration on Shopinbos is now open.\n\nCreate your account, add your business details and your products, and our team will verify you before launch on 1 November.\n\n${optOut}`,
    button: { text: "Register as a supplier", url: `${APP}/supplier/signup?utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=supplier-registration` },
  },
  {
    name: "sib_supplier_finish",
    role: "supplier",
    purpose: "Reminder before launch to register and get verified",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, Shopinbos opens to sellers this Sunday.\n\nSuppliers who are verified by then are the ones sellers see first. Registration takes a few minutes to start.\n\n${optOut}`,
    button: { text: "Register as a supplier", url: `${APP}/supplier/signup?utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=supplier-finish` },
  },
  {
    name: "sib_supplier_live",
    role: "supplier",
    purpose: "Launch day: sellers are choosing products",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, Shopinbos is live and sellers are choosing products for their stores today.\n\nYou can still join as a supplier: register, add your products, and they'll appear in the marketplace once you're verified.\n\n${optOut}`,
    button: { text: "Register as a supplier", url: `${APP}/supplier/signup?utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=supplier-live` },
  },
  // ─── Delivery partners ───
  {
    name: "sib_delivery_welcome",
    role: "delivery",
    purpose: "Welcome, right after joining as a delivery partner",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, thanks for your interest in delivering for Shopinbos!\n\nDelivery partner registration opens on Thursday 22 October, ten days before we launch to sellers. We'll send you the link here that morning, so you're ready to take orders from day one.\n\n${optOut}`,
    button: { text: "See how it works", url: SITE },
  },
  {
    name: "sib_delivery_registration_open",
    role: "delivery",
    purpose: "22 October: delivery partner registration is open",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, delivery partner registration on Shopinbos is now open.\n\nCreate your account, set your coverage areas and prices, add your riders, and our team will verify you before launch on 1 November.\n\n${optOut}`,
    button: { text: "Register as a partner", url: `${APP}/logistics/signup?utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=delivery-registration` },
  },
  {
    name: "sib_delivery_finish",
    role: "delivery",
    purpose: "Reminder before launch to register and get verified",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, Shopinbos opens to sellers this Sunday.\n\nDelivery partners who are verified by then are the ones sellers can book from their first orders. Registration takes a few minutes to start.\n\n${optOut}`,
    button: { text: "Register as a partner", url: `${APP}/logistics/signup?utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=delivery-finish` },
  },
  {
    name: "sib_delivery_live",
    role: "delivery",
    purpose: "Launch day: sellers are taking orders",
    category: "MARKETING",
    language: "en",
    body: `Hi {{1}}, Shopinbos is live and sellers are taking their first orders.\n\nYou can still join as a delivery partner: register, set your areas and prices, and sellers in your areas can book you once you're verified.\n\n${optOut}`,
    button: { text: "Register as a partner", url: `${APP}/logistics/signup?utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=delivery-live` },
  },
];

export function whatsappTemplate(name: string | null | undefined) {
  return WHATSAPP_TEMPLATES.find((template) => template.name === name) ?? null;
}

/** The template text as the admin preview and message log show it: {{first_name}} for {{1}}, the opt-out link for {{2}}. */
export function templatePreviewText(template: WhatsAppTemplate) {
  return template.body.replace(/\{\{1\}\}/g, "{{first_name}}").replace(/\{\{2\}\}/g, "[opt-out link]");
}

/** The template in Meta's format for POST /{WABA_ID}/message_templates, with sample values. */
export function metaTemplatePayload(template: WhatsAppTemplate) {
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    components: [
      { type: "BODY", text: template.body, example: { body_text: [["Ada", "https://app.shopinbos.com/api/public/leads/opt-out?t=example"]] } },
      { type: "BUTTONS", buttons: [{ type: "URL", text: template.button.text, url: template.button.url }] },
    ],
  };
}

function step(name: string, timing: { delayHours?: number; at?: string; skipAfter?: string }): LeadStepType {
  const template = whatsappTemplate(name)!;
  return {
    channel: "whatsapp",
    subject: null,
    body: templatePreviewText(template),
    ctaLabel: null,
    ctaUrl: null,
    waTemplate: template.name,
    waLanguage: template.language,
    delayHours: timing.delayHours ?? 0,
    at: timing.at ?? null,
    skipAfter: timing.skipAfter ?? null,
  };
}

const audience = (role: LeadRole): LeadAudienceType => ({ roles: [role], kinds: [], statuses: ["new", "contacted"], consentOnly: true, sinceDays: 0, source: "" });

const LAUNCH_10AM = "2026-11-01T10:00:00+01:00";
const REGISTRATION_10AM = "2026-10-22T10:00:00+01:00";

export const WHATSAPP_AUTOMATIONS: Array<{ name: string; audience: LeadAudienceType; steps: LeadStepType[]; includeExisting: boolean }> = [
  {
    name: "WhatsApp launch sequence: sellers",
    audience: audience("seller"),
    includeExisting: true,
    steps: [
      step("sib_seller_welcome", { delayHours: 1, skipAfter: LAUNCH_AT }),
      step("sib_seller_live", { at: LAUNCH_10AM, skipAfter: CATCH_UP_UNTIL }),
      step("sib_seller_reminder", { delayHours: 72 }),
    ],
  },
  {
    name: "WhatsApp launch sequence: suppliers",
    audience: audience("supplier"),
    includeExisting: true,
    steps: [
      step("sib_supplier_welcome", { delayHours: 1, skipAfter: PARTNER_REGISTRATION_AT }),
      step("sib_supplier_registration_open", { at: REGISTRATION_10AM, skipAfter: CATCH_UP_UNTIL }),
      step("sib_supplier_finish", { at: "2026-10-29T10:00:00+01:00" }),
      step("sib_supplier_live", { at: LAUNCH_10AM }),
    ],
  },
  {
    name: "WhatsApp launch sequence: delivery partners",
    audience: audience("delivery"),
    includeExisting: true,
    steps: [
      step("sib_delivery_welcome", { delayHours: 1, skipAfter: PARTNER_REGISTRATION_AT }),
      step("sib_delivery_registration_open", { at: REGISTRATION_10AM, skipAfter: CATCH_UP_UNTIL }),
      step("sib_delivery_finish", { at: "2026-10-29T10:00:00+01:00" }),
      step("sib_delivery_live", { at: LAUNCH_10AM }),
    ],
  },
];

/** Which templates an automation needs (to warn when one isn't approved yet). */
export function templatesUsed(steps: Array<Pick<LeadStepType, "channel" | "waTemplate">>) {
  return [...new Set(steps.filter((s) => s.channel === "whatsapp" && s.waTemplate).map((s) => s.waTemplate!))];
}
