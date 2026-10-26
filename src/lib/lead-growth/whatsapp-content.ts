// The WhatsApp side of the launch: the message templates Meta has to approve, and the three WhatsApp sequences
// (sellers, suppliers, delivery partners) that send them. Pure, unit-tested in tests/lead-growth.test.mjs.
//
// WhatsApp only lets a business start a chat with an approved template, so every step here is a template. Each one
// has an image header (the designed banners in public/brand/launch/) and two variables: {{1}} the lead's first name
// ("there" when we don't know it) and {{2}} their personal opt-out link. Meta doesn't allow a variable at the very
// start or end of the text, so both sit mid-sentence.
//
// Rex builds the seller's store; Peggy answers their customers. Templates are named shopinbos_* (an earlier text-
// only set was sib_*; Meta keeps names per account, so new names never clash with anything already submitted).
//
// The sequences are lighter than email (WhatsApp is more personal): a welcome an hour after the lead comes in, the
// moments that matter (registration opening on 22 October for partners, launch on 1 November) and one reminder.
// They go out at 10:00 Lagos, an hour after the matching email. The campaign templates (Rex, products, Peggy's
// inbox, Seller School, the season) are for one-off WhatsApp campaigns.
//
// The partnership outreach templates ("outreach") are first contact with people who never came to the website:
// Nigerian suppliers and delivery companies we'd like to partner with, and well-known sellers without an online
// store yet (a free store on us). Admin imports their numbers as a CSV with the source "outreach"; the three
// OUTREACH_AUTOMATIONS send an introduction, a follow-up three days later and a last note four days after that. A
// reply (or STOP) ends the follow-ups for that person, and the conversation carries on in Admin › Inbox.

import { LAUNCH_AT, PARTNER_REGISTRATION_AT, banner } from "./launch-sequences.ts";
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
  /** "sequence" templates are used by the launch sequences, "outreach" ones by the partnership outreach sequences; "campaign" ones are for one-off sends. */
  use: "sequence" | "campaign" | "outreach";
  category: "MARKETING" | "UTILITY";
  language: string;
  /** Header image: a banner in public/brand/launch/ (without .jpg). */
  image: string;
  /** Body with {{1}} (first name) and {{2}} (opt-out link). */
  body: string;
  button: { text: string; url: string };
};

const optOut = "If you'd rather not get these messages, open {{2}} to stop them.";
const utm = (url: string, campaign: string) => `${url}${url.includes("?") ? "&" : "?"}utm_source=shopinbos_leads&utm_medium=whatsapp&utm_campaign=${campaign}`;
const SIGNUP = `${APP}/signup`;
const SUPPLIER_SIGNUP = `${APP}/supplier/signup`;
const LOGISTICS_SIGNUP = `${APP}/logistics/signup`;
/** Where partners can write to us instead of replying on WhatsApp. */
export const OUTREACH_EMAIL = "hello@shopinbos.com";

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  // ─── Sellers: launch sequence ───
  {
    name: "shopinbos_seller_welcome",
    role: "seller",
    use: "sequence",
    purpose: "Welcome, right after joining the waitlist",
    category: "MARKETING",
    language: "en",
    image: "wa-01-welcome-seller",
    body: `Hi {{1}}, welcome to Shopinbos! 🎉 You're on the list.\n\nYour free yourshop.mybos.store is coming on Sunday 1 November. Rex will build your online store with you in about 5 minutes, and Peggy will answer your customers on WhatsApp, day and night.\n\nWe'll message you here the moment we're live. ${optOut}`,
    button: { text: "See what's coming", url: SITE },
  },
  {
    name: "shopinbos_seller_live",
    role: "seller",
    use: "sequence",
    purpose: "Launch day: Shopinbos is live",
    category: "MARKETING",
    language: "en",
    image: "wa-04-launch-live",
    body: `Hi {{1}}, we're live! 🚀 Start free today.\n\nClaim your free yourshop.mybos.store, tell Rex what you sell, and your store will be ready in about 5 minutes.\n\n${optOut}`,
    button: { text: "Create my store", url: utm(SIGNUP, "launch") },
  },
  {
    name: "shopinbos_seller_claim_domain",
    role: "seller",
    use: "sequence",
    purpose: "Reminder after launch: your free web address is waiting",
    category: "MARKETING",
    language: "en",
    image: "wa-05-claim-domain",
    body: `Hi {{1}}, your free web address is still waiting.\n\nClaim your yourshop.mybos.store in a minute and Rex will build your store in about 5 more. Reply here if you'd like a hand getting started.\n\n${optOut}`,
    button: { text: "Claim my address", url: utm(SIGNUP, "claim-domain") },
  },
  // ─── Suppliers: launch sequence ───
  {
    name: "shopinbos_supplier_welcome",
    role: "supplier",
    use: "sequence",
    purpose: "Welcome, right after joining as a supplier",
    category: "MARKETING",
    language: "en",
    image: "wa-02-welcome-supplier",
    body: `Hi {{1}}, thanks for joining the Shopinbos supplier waitlist!\n\nSupplier registration opens on Thursday 22 October, ten days before we launch to sellers. We'll reach out here to set up your listing, so your products are ready in the marketplace on day one.\n\n${optOut}`,
    button: { text: "See how it works", url: SITE },
  },
  {
    name: "shopinbos_supplier_registration_open",
    role: "supplier",
    use: "sequence",
    purpose: "22 October: supplier registration is open",
    category: "MARKETING",
    language: "en",
    image: "wa-15-supplier-call",
    body: `Hi {{1}}, let's get you listed! Supplier registration on Shopinbos is now open.\n\nRegister and add your products, or reply to this message to pick a time for a quick setup call with our team. We'll verify you before launch on 1 November.\n\n${optOut}`,
    button: { text: "Register as a supplier", url: utm(SUPPLIER_SIGNUP, "supplier-registration") },
  },
  {
    name: "shopinbos_supplier_finish",
    role: "supplier",
    use: "sequence",
    purpose: "Reminder before launch to register and get verified",
    category: "MARKETING",
    language: "en",
    image: "wa-15-supplier-call",
    body: `Hi {{1}}, Shopinbos opens to sellers this Sunday.\n\nSuppliers who are verified by then are the ones sellers see first. Register now, or reply here to pick a time for a quick setup call.\n\n${optOut}`,
    button: { text: "Register as a supplier", url: utm(SUPPLIER_SIGNUP, "supplier-finish") },
  },
  {
    name: "shopinbos_supplier_live",
    role: "supplier",
    use: "sequence",
    purpose: "Launch day: sellers are choosing products",
    category: "MARKETING",
    language: "en",
    image: "wa-15-supplier-call",
    body: `Hi {{1}}, Shopinbos is live and sellers are choosing products for their stores today.\n\nYou can still join as a supplier: register, add your products, and they'll appear in the marketplace once you're verified.\n\n${optOut}`,
    button: { text: "Register as a supplier", url: utm(SUPPLIER_SIGNUP, "supplier-live") },
  },
  // ─── Delivery partners: launch sequence ───
  {
    name: "shopinbos_delivery_welcome",
    role: "delivery",
    use: "sequence",
    purpose: "Welcome, right after joining as a delivery partner",
    category: "MARKETING",
    language: "en",
    image: "wa-03-welcome-delivery",
    body: `Hi {{1}}, you're on the list! Thanks for joining the Shopinbos delivery partner waitlist.\n\nRegistration opens on Thursday 22 October, ten days before we launch to sellers. We'll reach out here before jobs go live in your area.\n\n${optOut}`,
    button: { text: "See how it works", url: SITE },
  },
  {
    name: "shopinbos_delivery_registration_open",
    role: "delivery",
    use: "sequence",
    purpose: "22 October: delivery partner registration is open",
    category: "MARKETING",
    language: "en",
    image: "wa-16-delivery-call",
    body: `Hi {{1}}, let's get you on the road! Delivery partner registration on Shopinbos is now open.\n\nRegister and set your areas and prices, or reply to this message to pick a time for a quick onboarding call with our team. We'll verify you before launch on 1 November.\n\n${optOut}`,
    button: { text: "Register as a partner", url: utm(LOGISTICS_SIGNUP, "delivery-registration") },
  },
  {
    name: "shopinbos_delivery_finish",
    role: "delivery",
    use: "sequence",
    purpose: "Reminder before launch to register and get verified",
    category: "MARKETING",
    language: "en",
    image: "wa-16-delivery-call",
    body: `Hi {{1}}, Shopinbos opens to sellers this Sunday.\n\nDelivery partners who are verified by then are the ones sellers can book from their first orders. Register now, or reply here to pick a time for a quick onboarding call.\n\n${optOut}`,
    button: { text: "Register as a partner", url: utm(LOGISTICS_SIGNUP, "delivery-finish") },
  },
  {
    name: "shopinbos_delivery_live",
    role: "delivery",
    use: "sequence",
    purpose: "Launch day: sellers are taking orders",
    category: "MARKETING",
    language: "en",
    image: "wa-16-delivery-call",
    body: `Hi {{1}}, Shopinbos is live and sellers are taking their first orders.\n\nYou can still join as a delivery partner: register, set your areas and prices, and sellers in your areas can book you once you're verified.\n\n${optOut}`,
    button: { text: "Register as a partner", url: utm(LOGISTICS_SIGNUP, "delivery-live") },
  },
  // ─── Partnership outreach: suppliers ───
  {
    name: "shopinbos_partner_supplier_intro",
    role: "supplier",
    use: "outreach",
    purpose: "Outreach 1: introduce Shopinbos and invite them to partner as a supplier",
    category: "MARKETING",
    language: "en",
    image: "wa-15-supplier-call",
    body: `Hi {{1}}, this is the partnerships team at Shopinbos. We'd love to have you as a supplier partner.\n\nShopinbos helps businesses across Nigeria sell online. On our supplier marketplace, sellers find your products and add them to their online stores, to dropship or to buy wholesale. You list once, sellers bring the orders, and you get paid for each one. Joining is free; we only take a small commission when you sell.\n\nInterested? Reply to this message or email ${OUTREACH_EMAIL} and we'll set up your listing with you.\n\n${optOut}`,
    button: { text: "See the supplier side", url: utm(SUPPLIER_SIGNUP, "partner-supplier-intro") },
  },
  {
    name: "shopinbos_partner_supplier_follow_up",
    role: "supplier",
    use: "outreach",
    purpose: "Outreach 2 (3 days later): a short follow-up",
    category: "MARKETING",
    language: "en",
    image: "wa-15-supplier-call",
    body: `Hi {{1}}, just following up on our message about partnering with Shopinbos.\n\nSellers on Shopinbos are looking for reliable Nigerian suppliers to stock their stores. Our team will help you list your products and get verified, so sellers can find you and start ordering.\n\nReply "Interested" here, or email ${OUTREACH_EMAIL}, and we'll call you at a time that suits you.\n\n${optOut}`,
    button: { text: "Register as a supplier", url: utm(SUPPLIER_SIGNUP, "partner-supplier-follow-up") },
  },
  {
    name: "shopinbos_partner_supplier_last",
    role: "supplier",
    use: "outreach",
    purpose: "Outreach 3 (a week in): last note, the door stays open",
    category: "MARKETING",
    language: "en",
    image: "wa-15-supplier-call",
    body: `Hi {{1}}, one last note from Shopinbos. We won't keep messaging you about this.\n\nIf you'd like more sellers stocking your products, our supplier partnership is open whenever you're ready. Register in a few minutes, reply here, or email ${OUTREACH_EMAIL} and we'll take it from there.\n\n${optOut}`,
    button: { text: "Register as a supplier", url: utm(SUPPLIER_SIGNUP, "partner-supplier-last") },
  },
  // ─── Partnership outreach: delivery / logistics companies ───
  {
    name: "shopinbos_partner_delivery_intro",
    role: "delivery",
    use: "outreach",
    purpose: "Outreach 1: introduce Shopinbos and invite them to partner on deliveries",
    category: "MARKETING",
    language: "en",
    image: "wa-16-delivery-call",
    body: `Hi {{1}}, this is the partnerships team at Shopinbos. We'd love to partner with you on deliveries.\n\nShopinbos helps businesses across Nigeria sell online, and every order needs to get to a customer. As a logistics partner, you set your areas and prices, sellers book you for their orders, and you get paid for each delivery. Joining is free.\n\nInterested? Reply to this message or email ${OUTREACH_EMAIL} and we'll get you set up.\n\n${optOut}`,
    button: { text: "See the partner side", url: utm(LOGISTICS_SIGNUP, "partner-delivery-intro") },
  },
  {
    name: "shopinbos_partner_delivery_follow_up",
    role: "delivery",
    use: "outreach",
    purpose: "Outreach 2 (3 days later): a short follow-up",
    category: "MARKETING",
    language: "en",
    image: "wa-16-delivery-call",
    body: `Hi {{1}}, just following up on our message about delivering for sellers on Shopinbos.\n\nSellers are taking orders every day and need dependable delivery partners in their cities. Our team will help you set up your areas, prices and riders, so sellers can book you straight from their orders.\n\nReply "Interested" here, or email ${OUTREACH_EMAIL}, and we'll call you at a time that suits you.\n\n${optOut}`,
    button: { text: "Register as a partner", url: utm(LOGISTICS_SIGNUP, "partner-delivery-follow-up") },
  },
  {
    name: "shopinbos_partner_delivery_last",
    role: "delivery",
    use: "outreach",
    purpose: "Outreach 3 (a week in): last note, the door stays open",
    category: "MARKETING",
    language: "en",
    image: "wa-16-delivery-call",
    body: `Hi {{1}}, one last note from Shopinbos. We won't keep messaging you about this.\n\nIf you'd like more delivery jobs from online sellers, our logistics partnership is open whenever you're ready. Register in a few minutes, reply here, or email ${OUTREACH_EMAIL} and we'll take it from there.\n\n${optOut}`,
    button: { text: "Register as a partner", url: utm(LOGISTICS_SIGNUP, "partner-delivery-last") },
  },
  // ─── Partnership outreach: well-known sellers without an online store ───
  {
    name: "shopinbos_partner_seller_intro",
    role: "seller",
    use: "outreach",
    purpose: "Outreach 1: offer a free online store to a well-known seller",
    category: "MARKETING",
    language: "en",
    image: "wa-06-rex-build",
    body: `Hi {{1}}, this is the partnerships team at Shopinbos. We love what you're building, and we'd like to give you a free online store.\n\nYour own store with your own web address, where fans can shop your products and pay online. You manage your products, orders, payments and deliveries in one place, and Peggy, our AI assistant, answers your customers on WhatsApp day and night. Our team will set it up with you.\n\nInterested? Reply to this message or email ${OUTREACH_EMAIL} and we'll get started.\n\n${optOut}`,
    button: { text: "See your store", url: utm(SIGNUP, "partner-seller-intro") },
  },
  {
    name: "shopinbos_partner_seller_follow_up",
    role: "seller",
    use: "outreach",
    purpose: "Outreach 2 (3 days later): a short follow-up",
    category: "MARKETING",
    language: "en",
    image: "wa-05-claim-domain",
    body: `Hi {{1}}, just following up on the free online store we'd like to give you.\n\nTell us what you sell and our team, with Rex, our AI store builder, will have your store ready in minutes: your products, your prices, your brand. You keep the sales, and your customers get a proper place to shop you.\n\nReply "Interested" here, or email ${OUTREACH_EMAIL}, and we'll set it up with you.\n\n${optOut}`,
    button: { text: "Claim my free store", url: utm(SIGNUP, "partner-seller-follow-up") },
  },
  {
    name: "shopinbos_partner_seller_last",
    role: "seller",
    use: "outreach",
    purpose: "Outreach 3 (a week in): last note, the offer stays open",
    category: "MARKETING",
    language: "en",
    image: "wa-05-claim-domain",
    body: `Hi {{1}}, one last note from Shopinbos. We won't keep messaging you about this.\n\nYour free online store is still here whenever you're ready. Claim it in a minute, reply here, or email ${OUTREACH_EMAIL} and our team will set it up for you.\n\n${optOut}`,
    button: { text: "Claim my free store", url: utm(SIGNUP, "partner-seller-last") },
  },
  // ─── Sellers: campaigns ───
  {
    name: "shopinbos_seller_tell_rex",
    role: "seller",
    use: "campaign",
    purpose: "Next step: tell Rex what you sell",
    category: "MARKETING",
    language: "en",
    image: "wa-06-rex-build",
    body: `Hi {{1}}, your next step: tell Rex what you sell.\n\nRex builds your store with you, from the design to the words, and you hit publish. It takes about 5 minutes.\n\n${optOut}`,
    button: { text: "Build my store", url: utm(SIGNUP, "tell-rex") },
  },
  {
    name: "shopinbos_seller_add_products",
    role: "seller",
    use: "campaign",
    purpose: "Next step: add your first products",
    category: "MARKETING",
    language: "en",
    image: "wa-07-add-products",
    body: `Hi {{1}}, time to add your first products.\n\nJust the photos, prices and sizes. Rex writes the descriptions for you. No stock? Add products from verified suppliers instead.\n\n${optOut}`,
    button: { text: "Add products", url: utm(SIGNUP, "add-products") },
  },
  {
    name: "shopinbos_feature_inbox",
    role: "seller",
    use: "campaign",
    purpose: "Feature drop: one inbox, Peggy answers",
    category: "MARKETING",
    language: "en",
    image: "wa-08-feature-drop",
    body: `Hi {{1}}, new on Shopinbos: one inbox for WhatsApp, Instagram, Facebook and email.\n\nPeggy answers your customers straight away from your own products and prices, and hands the chat to you when they want a person.\n\n${optOut}`,
    button: { text: "See what's new", url: utm(SIGNUP, "feature-inbox") },
  },
  {
    name: "shopinbos_seller_school",
    role: "seller",
    use: "campaign",
    purpose: "Seller School: this week's lesson",
    category: "MARKETING",
    language: "en",
    image: "wa-09-seller-school",
    body: `Hi {{1}}, this week's Seller School lesson is out: price for profit.\n\nCount every cost first (the item, packaging, delivery, fees), then add your margin on top.\n\n${optOut}`,
    button: { text: "Read the lesson", url: utm(SITE, "seller-school") },
  },
  {
    name: "shopinbos_black_friday",
    role: "seller",
    use: "campaign",
    purpose: "Black Friday (27 November)",
    category: "MARKETING",
    language: "en",
    image: "wa-10-black-friday",
    body: `Hi {{1}}, Black Friday is on 27 November. Get ready now.\n\nPick your hero products, set an honest discount code and book your deliveries early.\n\n${optOut}`,
    button: { text: "Get ready", url: utm(SIGNUP, "black-friday") },
  },
  {
    name: "shopinbos_cyber_monday",
    role: "seller",
    use: "campaign",
    purpose: "Cyber Monday (30 November)",
    category: "MARKETING",
    language: "en",
    image: "wa-11-cyber-monday",
    body: `Hi {{1}}, Cyber Monday is your last chance of the season.\n\nOne final offer, and a reminder to the carts that didn't check out. Shopinbos can send those reminders for you.\n\n${optOut}`,
    button: { text: "Set it up", url: utm(SIGNUP, "cyber-monday") },
  },
  {
    name: "shopinbos_christmas",
    role: "seller",
    use: "campaign",
    purpose: "Christmas: make your shop giftable",
    category: "MARKETING",
    language: "en",
    image: "wa-12-christmas",
    body: `Hi {{1}}, make your shop giftable this Christmas.\n\nGift sets, nice packaging and clear order-by dates help shoppers buy presents from you with confidence.\n\n${optOut}`,
    button: { text: "Get ready", url: utm(SIGNUP, "christmas") },
  },
  {
    name: "shopinbos_detty_december",
    role: "seller",
    use: "campaign",
    purpose: "Detty December: owambe season",
    category: "MARKETING",
    language: "en",
    image: "wa-13-detty-december",
    body: `Hi {{1}}, owambe season don land! 🎉\n\nRun weekend flash sales, post in the evenings and book your deliveries early. Peggy will keep up with the chats.\n\n${optOut}`,
    button: { text: "Get ready", url: utm(SIGNUP, "detty-december") },
  },
  {
    name: "shopinbos_new_year",
    role: "seller",
    use: "campaign",
    purpose: "New year, new shop goals",
    category: "MARKETING",
    language: "en",
    image: "wa-14-new-year",
    body: `Hi {{1}}, new year, new shop goals! Thank you for building with us. Here's to 2027.\n\nYour free yourshop.mybos.store is waiting whenever you're ready.\n\n${optOut}`,
    button: { text: "Start my store", url: utm(SIGNUP, "new-year") },
  },
];

export function whatsappTemplate(name: string | null | undefined) {
  return WHATSAPP_TEMPLATES.find((template) => template.name === name) ?? null;
}

/** Full URL of a template's header image. */
export function templateImageUrl(template: WhatsAppTemplate) {
  return banner(template.image);
}

/** The template text as the admin preview and message log show it: {{first_name}} for {{1}}, the opt-out link for {{2}}. */
export function templatePreviewText(template: WhatsAppTemplate) {
  return template.body.replace(/\{\{1\}\}/g, "{{first_name}}").replace(/\{\{2\}\}/g, "[opt-out link]");
}

/**
 * The template in Meta's format for POST /{WABA_ID}/message_templates, with sample values. `headerHandle` is the
 * sample image's handle from Meta's Resumable Upload API (whatsapp-meta.server.ts uploads it).
 */
export function metaTemplatePayload(template: WhatsAppTemplate, headerHandle: string) {
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    components: [
      { type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle] } },
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
    imageUrl: templateImageUrl(template),
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
      step("shopinbos_seller_welcome", { delayHours: 1, skipAfter: LAUNCH_AT }),
      step("shopinbos_seller_live", { at: LAUNCH_10AM, skipAfter: CATCH_UP_UNTIL }),
      step("shopinbos_seller_claim_domain", { delayHours: 72 }),
    ],
  },
  {
    name: "WhatsApp launch sequence: suppliers",
    audience: audience("supplier"),
    includeExisting: true,
    steps: [
      step("shopinbos_supplier_welcome", { delayHours: 1, skipAfter: PARTNER_REGISTRATION_AT }),
      step("shopinbos_supplier_registration_open", { at: REGISTRATION_10AM, skipAfter: CATCH_UP_UNTIL }),
      step("shopinbos_supplier_finish", { at: "2026-10-29T10:00:00+01:00" }),
      step("shopinbos_supplier_live", { at: LAUNCH_10AM }),
    ],
  },
  {
    name: "WhatsApp launch sequence: delivery partners",
    audience: audience("delivery"),
    includeExisting: true,
    steps: [
      step("shopinbos_delivery_welcome", { delayHours: 1, skipAfter: PARTNER_REGISTRATION_AT }),
      step("shopinbos_delivery_registration_open", { at: REGISTRATION_10AM, skipAfter: CATCH_UP_UNTIL }),
      step("shopinbos_delivery_finish", { at: "2026-10-29T10:00:00+01:00" }),
      step("shopinbos_delivery_live", { at: LAUNCH_10AM }),
    ],
  },
];

/** The source an outreach list is imported with (Admin › Leads › Import, or the outreach card on the WhatsApp page). */
export const OUTREACH_SOURCE = "outreach";

// People on an outreach list never asked to hear from us, so the audience can't require the form's consent tick;
// the source keeps these sequences to the imported list, never website leads. Everyone gets the opt-out link.
const outreachAudience = (role: LeadRole): LeadAudienceType => ({ roles: [role], kinds: [], statuses: ["new", "contacted"], consentOnly: false, sinceDays: 0, source: OUTREACH_SOURCE });

const outreachSteps = (role: LeadRole) => [
  step(`shopinbos_partner_${role}_intro`, { delayHours: 0 }),
  step(`shopinbos_partner_${role}_follow_up`, { delayHours: 72 }),
  step(`shopinbos_partner_${role}_last`, { delayHours: 96 }),
];

export const OUTREACH_AUTOMATIONS: Array<{ name: string; audience: LeadAudienceType; steps: LeadStepType[]; includeExisting: boolean }> = [
  { name: "WhatsApp outreach: supplier partners", audience: outreachAudience("supplier"), includeExisting: true, steps: outreachSteps("supplier") },
  { name: "WhatsApp outreach: delivery partners", audience: outreachAudience("delivery"), includeExisting: true, steps: outreachSteps("delivery") },
  { name: "WhatsApp outreach: sellers (free store)", audience: outreachAudience("seller"), includeExisting: true, steps: outreachSteps("seller") },
];

/** Which templates an automation needs (to warn when one isn't approved yet). */
export function templatesUsed(steps: Array<Pick<LeadStepType, "channel" | "waTemplate">>) {
  return [...new Set(steps.filter((s) => s.channel === "whatsapp" && s.waTemplate).map((s) => s.waTemplate!))];
}
