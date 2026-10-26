// WhatsApp templates for people who already have a Shopinbos account (sellers, suppliers, delivery partners):
// referrals now; the weekly tips and other member campaigns join this list. The waitlist's templates are in
// src/lib/lead-growth/whatsapp-content.ts. Pure, unit-tested in tests/referrals.test.mjs.
//
// Meta's rules this follows: names are lower case with _; every variable has a sample; no variable at the very start
// or end of the text, and never two side by side. Header images are 1200×628 banners in public/brand/members/.

import { LANGUAGES, type Locale } from "../../../shared/i18n/index.ts";
import { localizedTemplateName, metaLanguage, templateText } from "./i18n/index.ts";

const APP = "https://app.shopinbos.com";

export type MemberTemplateGroup = "referral" | "tips" | "journeys" | "wallet" | "orders" | "verify";

export type MemberTemplate = {
  name: string;
  group: MemberTemplateGroup;
  /** What it's for, shown in the admin list. */
  purpose: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  /** The app language it's written in: English, or a translation (src/lib/member-messaging/i18n/<lang>.ts). */
  locale?: Locale;
  /** Banner in public/brand/members/ (without .jpg). */
  image: string;
  /** Body with {{1}}, {{2}}…; `variables` names them and `examples` gives Meta a sample for each. */
  body: string;
  variables: string[];
  examples: string[];
  /** A URL ending in {{1}} is filled per message (buttonExample is Meta's sample for it). */
  button: { text: string; url: string; example?: string };
};

/** A template's words in another language (src/lib/member-messaging/i18n/<lang>.ts). */
export type TemplateText = {
  /** Same {{1}}, {{2}}… as the English body, none at the very start or end, never two side by side. */
  body: string;
  /** Button text, at most 25 characters. */
  button: string;
  /** Meta's sample for each variable, in this language. */
  examples: string[];
};

const ENGLISH_TEMPLATES: MemberTemplate[] = [
  {
    // The first "verify your account" nudge for a partner already given a wallet account number
    // (src/lib/verification/reminders.server.ts).
    name: "shopinbos_verify_wallet",
    group: "verify",
    purpose: "Verify your business: your wallet switches on when you do",
    category: "UTILITY",
    language: "en",
    image: "call-peggy",
    body: "Hi {{1}}, your Shopinbos Wallet for {{2}} is set up and switches on as soon as your business is verified. 🔓\n\nStill needed: {{3}}. It only takes a few minutes.\n\nStuck? Call Peggy, our AI support, for free: open your dashboard and tap Call Peggy.",
    variables: ["first name", "business", "what's missing"],
    examples: ["Ada", "Ada Logistics", "CAC certificate, ID"],
    button: { text: "Verify my business", url: `${APP}/verify` },
  },
  {
    name: "shopinbos_verify_reminder",
    group: "verify",
    purpose: "Verify your business (reminder), with Peggy's free call",
    category: "UTILITY",
    language: "en",
    image: "call-peggy",
    body: "Hi {{1}}, {{2}} isn't verified on Shopinbos yet, so {{3}} can't find you. ✅\n\nStill needed: {{4}}.\n\nNeed a hand? Peggy, our AI support, talks you through it on a free call: open your dashboard and tap Call Peggy.",
    variables: ["first name", "business", "who's looking", "what's missing"],
    examples: ["Ada", "Ada Fabrics", "sellers", "CAC certificate"],
    button: { text: "Verify my business", url: `${APP}/verify` },
  },
  {
    name: "shopinbos_wallet_ready",
    group: "wallet",
    purpose: "Your Shopinbos Wallet account number is ready",
    category: "UTILITY",
    language: "en",
    image: "setup-help",
    body: "Hi {{1}}, your Shopinbos Wallet is ready! 🎉\n\nYour own account number is {{2}} at {{3}}, in the name {{4}}. Transfer to it from any bank app and the money lands in your wallet balance within a minute or two.\n\nUse your balance for AI credits and other Shopinbos services, and withdraw to your bank whenever you like.",
    variables: ["first name", "account number", "bank", "account name"],
    examples: ["Ada", "9912345678", "Wema Bank", "SHOPINBOS/ADA FABRICS"],
    button: { text: "Open my wallet", url: `${APP}/wallet` },
  },
  {
    // Sent from Shopinbos's own number for stores that haven't connected their own WhatsApp (src/lib/notifications/
    // order-summary-whatsapp.server.ts); stores with their own number send their own order_confirmation template.
    name: "shopinbos_order_summary",
    group: "orders",
    purpose: "A shopper's order summary, for stores without their own WhatsApp number",
    category: "UTILITY",
    language: "en",
    image: "setup-help",
    body: "Hi {{1}}, thanks for your order from {{2}}! 🛍️\n\nOrder {{3}}: {{4}}\nTotal: {{5}}\n\nHow to pay: {{6}} Tap below to see your order.",
    variables: ["first name", "store name", "order number", "items", "total", "how to pay"],
    examples: ["Ada", "Rexi", "SB-MVP80C9V-8D1B09", "1 × Ankara tote, 2 × Silk scarf", "₦7,100", "You can pay by card, bank transfer or USSD."],
    button: { text: "View my order", url: `${APP}/o/{{1}}`, example: `${APP}/o/cmvp80c9v0001` },
  },
  {
    name: "shopinbos_refer_supplier",
    group: "referral",
    purpose: "Invite campaign: refer a supplier",
    category: "MARKETING",
    language: "en",
    image: "refer-supplier",
    body: "Hi {{1}}, know a supplier who should be selling to more shops? 🤝\n\nInvite them to Shopinbos with your link. When they're verified and list 5 products, you get {{2}}. They get a free month of Supplier Plus and a featured week in the marketplace.\n\nTap below to get your link and share it on WhatsApp.",
    variables: ["first name", "your reward"],
    examples: ["Ada", "3 months free or 500 AI credits"],
    button: { text: "Invite a supplier", url: `${APP}/refer?for=supplier` },
  },
  {
    name: "shopinbos_refer_seller",
    group: "referral",
    purpose: "Invite campaign: refer a seller",
    category: "MARKETING",
    language: "en",
    image: "refer-seller",
    body: "Hi {{1}}, know someone who sells on Instagram or WhatsApp? 🛍️\n\nInvite them to Shopinbos with your link. When their shop is live and gets its first paid order, you get {{2}}. They get a free month of Starter and 100 AI credits to build their store with Rex.\n\nTap below to get your link.",
    variables: ["first name", "your reward"],
    examples: ["Ada", "1 month free or 200 AI credits"],
    button: { text: "Invite a seller", url: `${APP}/refer?for=seller` },
  },
  {
    name: "shopinbos_refer_partner",
    group: "referral",
    purpose: "Invite campaign: refer a delivery partner",
    category: "MARKETING",
    language: "en",
    image: "refer-partner",
    body: "Hi {{1}}, know a dispatch rider or delivery company that wants more jobs? 🚚\n\nInvite them to Shopinbos with your link. When they're verified and complete their first delivery, you get {{2}}. They get a free month of Logistics Plus.\n\nTap below to get your link.",
    variables: ["first name", "your reward"],
    examples: ["Ada", "2 months free or 300 AI credits"],
    button: { text: "Invite a partner", url: `${APP}/refer?for=logistics_partner` },
  },
  {
    name: "shopinbos_referral_joined",
    group: "referral",
    purpose: "Someone joined with your invite",
    category: "UTILITY",
    language: "en",
    image: "referral-reward",
    body: "Good news, {{1}}! {{2}} just joined Shopinbos with your invite. 🎉\n\nYour reward comes when {{3}}. We'll message you here the moment it does.",
    variables: ["first name", "their business", "when it counts"],
    examples: ["Ada", "Kemi's Fabrics", "they're verified and have 5 approved products"],
    button: { text: "See my invites", url: `${APP}/refer` },
  },
  {
    name: "shopinbos_referral_reward",
    group: "referral",
    purpose: "Your invite counted: reward given",
    category: "UTILITY",
    language: "en",
    image: "referral-reward",
    body: "Your reward is here, {{1}}! 🎁 {{2}} now counts on Shopinbos, so you've got {{3}}.\n\nThank you for growing the Shopinbos family. Every business that joins with your link earns you more.",
    variables: ["first name", "their business", "the reward"],
    examples: ["Ada", "Kemi's Fabrics", "3 months free"],
    button: { text: "Use my reward", url: `${APP}/refer` },
  },
  {
    name: "shopinbos_referral_welcome",
    group: "referral",
    purpose: "Welcome gift for someone who joined with an invite",
    category: "UTILITY",
    language: "en",
    image: "referral-reward",
    body: "Welcome to Shopinbos, {{1}}! {{2}} invited you, so you've got {{3}}. 🎉\n\nTap below to finish setting up. Peggy is here if you need a hand.",
    variables: ["first name", "who invited them", "the welcome gift"],
    examples: ["Kemi", "Ada Fashion", "1 month of Supplier Plus free + 1 featured week in the marketplace"],
    button: { text: "Finish setting up", url: `${APP}/` },
  },
  {
    name: "shopinbos_setup_help",
    group: "journeys",
    purpose: "Setup not finished (suppliers and delivery partners, day 3)",
    category: "UTILITY",
    language: "en",
    image: "setup-help",
    body: "Hi {{1}}, it's Peggy from Shopinbos. You're nearly ready to get orders: the next step is {{2}}.\n\nTap below to open your dashboard. You can chat with me there or call me for free, and I'll walk you through it.",
    variables: ["first name", "the next step"],
    examples: ["Kemi", "adding your pickup point"],
    button: { text: "Finish setting up", url: `${APP}/login` },
  },
  {
    name: "shopinbos_welcome_back",
    group: "journeys",
    purpose: "Win-back after 14 quiet days (with the credits gift)",
    category: "MARKETING",
    language: "en",
    image: "welcome-back",
    body: "Hi {{1}}, we've missed you on Shopinbos! 👋 {{2}}\n\nTap below to pick up where you left off. Reply STOP if you'd rather not get these messages.",
    variables: ["first name", "what's waiting for them"],
    examples: ["Ada", "We've added 50 free AI credits to your account for Rex videos and product photos."],
    button: { text: "Open Shopinbos", url: `${APP}/login` },
  },
  ...(["seller", "supplier", "partner"] as const).map((who): MemberTemplate => ({
    name: `shopinbos_tip_${who}`,
    group: "tips",
    purpose: `Weekly tip for ${who === "partner" ? "delivery partners" : `${who}s`} (Wednesdays)`,
    category: "MARKETING",
    language: "en",
    image: `tips-${who}`,
    body: "Hi {{1}}, here's this week's tip from {{2}} 💡\n\n{{3}}\n\nTap below to try it in Shopinbos. Reply STOP if you'd rather not get weekly tips.",
    variables: ["first name", "Rex or Peggy", "the tip"],
    examples: [
      "Ada",
      "Rex",
      who === "seller"
        ? "the first 2 seconds of a video decide if people keep watching, so open with your product in someone's hand, not your logo."
        : who === "supplier"
          ? "shops order more from suppliers who accept orders within 2 hours, so turn on order alerts and accept before lunch."
          : "accepting jobs within 30 minutes moves you up the list shops see, so keep notifications on during your working hours.",
    ],
    button: { text: "Show me how", url: `${APP}/tip/{{1}}`, example: `${APP}/tip/${who}-tip` },
  })),
];

/** Each template in Pidgin, Yorùbá, Hausa and Igbo too ("<name>_<lang>"), wherever a translation exists. */
const TRANSLATED_TEMPLATES: MemberTemplate[] = LANGUAGES.filter((language) => language.code !== "en").flatMap((language) =>
  ENGLISH_TEMPLATES.flatMap((template): MemberTemplate[] => {
    const text = templateText(template.name, language.code);
    if (!text) return [];
    return [
      {
        ...template,
        name: localizedTemplateName(template.name, language.code),
        purpose: `${template.purpose} (${language.name})`,
        language: metaLanguage(language.code),
        locale: language.code,
        body: text.body,
        examples: text.examples,
        button: { ...template.button, text: text.button },
      },
    ];
  }),
);

export const MEMBER_TEMPLATES: MemberTemplate[] = [...ENGLISH_TEMPLATES.map((template) => ({ ...template, locale: "en" as const })), ...TRANSLATED_TEMPLATES];

/**
 * The template to send someone: in their language when that version is approved, else the English one. Returns the
 * language it's in, so the variables can be filled in the same language.
 */
export function memberTemplateFor(name: string, locale: Locale, approved: ReadonlySet<string>): { template: MemberTemplate; locale: Locale } | null {
  const translated = memberTemplate(localizedTemplateName(name, locale));
  if (locale !== "en" && translated && approved.has(translated.name)) return { template: translated, locale };
  const english = memberTemplate(name);
  return english ? { template: english, locale: "en" } : null;
}

export function memberTemplate(name: string | null | undefined) {
  return MEMBER_TEMPLATES.find((template) => template.name === name) ?? null;
}

export function memberTemplateImageUrl(template: MemberTemplate) {
  return `${APP}/brand/members/${template.image}.jpg`;
}

/** The body as the admin list shows it: {{first name}} for {{1}} and so on. */
export function memberTemplatePreview(template: MemberTemplate) {
  return template.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => `{{${template.variables[Number(n) - 1] ?? n}}}`);
}

/** How many {{n}} the body uses (each must have a sample). */
export function templateVariableCount(body: string) {
  return new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1])).size;
}

/** The template in Meta's format for POST /{WABA_ID}/message_templates. */
export function memberTemplatePayload(template: MemberTemplate, headerHandle: string) {
  return {
    name: template.name,
    language: template.language,
    category: template.category,
    components: [
      { type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle] } },
      { type: "BODY", text: template.body, example: { body_text: [template.examples] } },
      { type: "BUTTONS", buttons: [{ type: "URL", text: template.button.text, url: template.button.url, ...(template.button.example ? { example: [template.button.example] } : {}) }] },
    ],
  };
}
