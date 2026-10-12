// Legal pages (privacy, terms, refunds, delivery, cookies, contact, plus the seller's own): what each page
// holds, reading them out of Store.brandSettings (with the old plain-text `legal.*` fields converted on
// read so nothing is lost), the look options, the table of contents, and the starter templates. Pure (only
// other pure helpers imported) so it is unit-tested in tests/behaviour.test.mjs.

import { EMPTY_DOC, headingIds, plainText, sanitizeDoc, type RichDoc, type RichNode } from "../cms/richtext.ts";
import { markdownToDoc } from "../cms/markdown.ts";
import { normalizeSeo, type SeoFields } from "../seo/fields.ts";

export const STANDARD_LEGAL_PAGES = [
  { key: "privacy-policy", title: "Privacy policy", legacyKey: "privacyPolicy", help: "What customer data you collect, why, and how people can ask you to delete it." },
  { key: "terms-of-service", title: "Terms of service", legacyKey: "terms", help: "The rules for buying from your store: orders, prices, payment and disputes." },
  { key: "refund-policy", title: "Returns and refunds", legacyKey: "returnPolicy", help: "How long customers have to return items, what you take back and how refunds work." },
  { key: "shipping-policy", title: "Delivery policy", legacyKey: "shippingPolicy", help: "Where you deliver, how long it takes and how delivery fees are worked out." },
  { key: "cookie-policy", title: "Cookie policy", legacyKey: null, help: "The small files your store keeps in shoppers' browsers, and why." },
  { key: "contact-information", title: "Contact information", legacyKey: null, help: "Your business name, address, phone and email, so shoppers know who they are buying from." },
] as const;

export type StandardLegalKey = (typeof STANDARD_LEGAL_PAGES)[number]["key"];

export const MAX_CUSTOM_LEGAL_PAGES = 10;
/** Largest saved document (JSON), so one page can't bloat the store's settings. */
export const MAX_LEGAL_DOC_BYTES = 200_000;

export const LEGAL_LAYOUTS = [
  { id: "classic", label: "Classic", hint: "One clean column, like a document." },
  { id: "contents", label: "With contents", hint: "A table of contents beside the text that follows you down the page." },
  { id: "centered", label: "Centered card", hint: "The text sits on a card in the middle of the page." },
  { id: "wide", label: "Wide", hint: "Uses more of the screen, good for long tables." },
] as const;
export type LegalLayout = (typeof LEGAL_LAYOUTS)[number]["id"];

export const LEGAL_WIDTHS = { narrow: 680, normal: 780, wide: 1040 } as const;
export type LegalWidth = keyof typeof LEGAL_WIDTHS;

export interface LegalStyle {
  layout: LegalLayout;
  width: LegalWidth;
  /** Show the table of contents (from the H2/H3 headings). */
  toc: boolean;
  showUpdated: boolean;
  /** "theme" uses the store's heading font; "serif"/"sans" override it. */
  headingFont: "theme" | "serif" | "sans";
  /** #RRGGBB for links and the contents marker, or "" for the theme's accent. */
  accent: string;
}

export interface LegalPage {
  key: string;
  title: string;
  doc: RichDoc;
  style: LegalStyle;
  seo: SeoFields;
  published: boolean;
  /** ISO time of the last save, or null (never saved here, e.g. converted from the old text box). */
  updatedAt: string | null;
  custom: boolean;
}

export type LegalStatus = "published" | "draft" | "empty";

export const DEFAULT_LEGAL_STYLE: LegalStyle = { layout: "classic", width: "normal", toc: false, showUpdated: true, headingFont: "theme", accent: "" };

/** What picking a layout preset sets (the seller can still change each option after). */
export const LAYOUT_PRESETS: Record<LegalLayout, Partial<LegalStyle>> = {
  classic: { width: "normal", toc: false },
  contents: { width: "normal", toc: true },
  centered: { width: "narrow", toc: false },
  wide: { width: "wide", toc: false },
};

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const str = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : "");

export function isStandardLegalKey(key: string): key is StandardLegalKey {
  return STANDARD_LEGAL_PAGES.some((page) => page.key === key);
}

export function standardLegalPage(key: string) {
  return STANDARD_LEGAL_PAGES.find((page) => page.key === key) ?? null;
}

/** A page title → a web-address key ("Warranty & care" → "warranty-and-care"). */
export function legalSlug(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** null when a key can be used for a new custom page, else what's wrong in plain words. */
export function customLegalKeyError(key: string, existing: Iterable<string> = []): string | null {
  if (!key) return "Give the page a name";
  if (key.length > 60 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return "Use lowercase letters, numbers and single dashes only";
  if (isStandardLegalKey(key)) return "That page is already in your list";
  if ([...existing].includes(key)) return "You already have a page with that name";
  return null;
}

export function normalizeLegalStyle(raw: unknown): LegalStyle {
  const r = rec(raw);
  const layout = LEGAL_LAYOUTS.some((entry) => entry.id === r.layout) ? (r.layout as LegalLayout) : DEFAULT_LEGAL_STYLE.layout;
  const width = typeof r.width === "string" && r.width in LEGAL_WIDTHS ? (r.width as LegalWidth) : DEFAULT_LEGAL_STYLE.width;
  const accent = typeof r.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(r.accent) ? r.accent.toUpperCase() : "";
  return {
    layout,
    width,
    toc: typeof r.toc === "boolean" ? r.toc : layout === "contents",
    showUpdated: r.showUpdated !== false,
    headingFont: r.headingFont === "serif" || r.headingFont === "sans" ? r.headingFont : "theme",
    accent,
  };
}

function validIso(value: unknown) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** One stored page (any shape) → the full page, with the document re-sanitised. */
export function normalizeLegalPage(key: string, raw: unknown, fallbackTitle?: string): LegalPage {
  const r = rec(raw);
  const standard = standardLegalPage(key);
  const title = str(r.title, 120).trim() || fallbackTitle || standard?.title || key.replace(/-/g, " ");
  return {
    key,
    title,
    doc: r.doc ? sanitizeDoc(r.doc) : EMPTY_DOC,
    style: normalizeLegalStyle(r.style),
    seo: normalizeSeo(r.seo),
    published: r.published === true,
    updatedAt: validIso(r.updatedAt),
    custom: !standard,
  };
}

/** Plain text from the old textarea → a document (blank lines are paragraphs; Markdown-ish text keeps its shape). */
export function legacyTextToDoc(text: string): RichDoc {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return EMPTY_DOC;
  return sanitizeDoc(markdownToDoc(clean));
}

export function isDocEmpty(doc: RichDoc) {
  if (plainText(doc).trim()) return false;
  // A page that is only pictures or a table still counts as written.
  const walk = (node: RichNode): boolean => ["image", "youtube", "table", "button", "productCard"].includes(node.type) || (node.content ?? []).some(walk);
  return !doc.content.some(walk);
}

export function legalPageStatus(page: Pick<LegalPage, "doc" | "published">): LegalStatus {
  if (isDocEmpty(page.doc)) return "empty";
  return page.published ? "published" : "draft";
}

/**
 * Every legal page of a store, standard ones first (always listed, even when empty) then the seller's own.
 * Pages saved before this editor existed (plain text in brandSettings.legal) are converted on read and
 * count as published, since the old screen told sellers that text was shown to shoppers.
 */
export function readLegalPages(brandSettings: unknown): LegalPage[] {
  const settings = rec(brandSettings);
  const stored = rec(settings.legalPages);
  const legacy = rec(settings.legal);
  const pages: LegalPage[] = STANDARD_LEGAL_PAGES.map((standard) => {
    if (standard.key in stored) return normalizeLegalPage(standard.key, stored[standard.key]);
    const oldText = standard.legacyKey ? str(legacy[standard.legacyKey], 100_000) : "";
    const page = normalizeLegalPage(standard.key, {});
    return oldText.trim() ? { ...page, doc: legacyTextToDoc(oldText), published: true } : page;
  });
  const custom = Object.keys(stored)
    .filter((key) => !isStandardLegalKey(key) && !customLegalKeyError(key))
    .slice(0, MAX_CUSTOM_LEGAL_PAGES)
    .map((key) => normalizeLegalPage(key, stored[key]));
  return [...pages, ...custom];
}

export function findLegalPage(brandSettings: unknown, key: string) {
  return readLegalPages(brandSettings).find((page) => page.key === key) ?? null;
}

/** A page as it is stored in brandSettings.legalPages[key]. */
export function storedLegalPage(page: LegalPage) {
  return { title: page.title, doc: page.doc, style: page.style, seo: page.seo, published: page.published, updatedAt: page.updatedAt };
}

/** brandSettings.legalPages from a list of pages. */
export function storedLegalPages(pages: LegalPage[]) {
  return Object.fromEntries(pages.map((page) => [page.key, storedLegalPage(page)]));
}

/**
 * The plain-text copies older readers use (store health, Rex, the store overview): brandSettings.legal.*,
 * filled only for published pages.
 */
export function legacyLegalCopies(pages: LegalPage[]) {
  const out: Record<string, string> = {};
  for (const standard of STANDARD_LEGAL_PAGES) {
    if (!standard.legacyKey) continue;
    const page = pages.find((entry) => entry.key === standard.key);
    out[standard.legacyKey] = page && page.published && !isDocEmpty(page.doc) ? plainText(page.doc).trim().slice(0, 20_000) : "";
  }
  return out;
}

export function docBytes(doc: RichDoc) {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
}

// ─── Storefront ──────────────────────────────────────────────────────────────

export const legalPagePath = (key: string) => `/policies/${key}`;

/**
 * What shoppers may see of brandSettings.legalPages: published pages only, as { title, published } (the
 * text itself is loaded by the policy page), so drafts never leave the server and the store's payload
 * stays small.
 */
export function publicLegalPagesSummary(brandSettings: unknown) {
  return Object.fromEntries(
    readLegalPages(brandSettings)
      .filter((page) => legalPageStatus(page) === "published")
      .map((page) => [page.key, { title: page.title, published: true }]),
  );
}

/** Footer and checkout links: the store's published legal pages, in order. Works on full or public settings. */
export function legalLinks(brandSettings: unknown): Array<{ key: string; title: string }> {
  const settings = rec(brandSettings);
  const stored = rec(settings.legalPages);
  const legacy = rec(settings.legal);
  const out: Array<{ key: string; title: string }> = [];
  for (const standard of STANDARD_LEGAL_PAGES) {
    const entry = stored[standard.key];
    if (entry !== undefined) {
      const page = rec(entry);
      // Public summaries have no doc; full settings must have a written doc.
      if (page.published === true && (!("doc" in page) || !isDocEmpty(sanitizeDoc(page.doc)))) out.push({ key: standard.key, title: str(page.title, 120).trim() || standard.title });
    } else if (standard.legacyKey && str(legacy[standard.legacyKey], 100_000).trim()) {
      out.push({ key: standard.key, title: standard.title });
    }
  }
  for (const key of Object.keys(stored)) {
    if (isStandardLegalKey(key) || customLegalKeyError(key) || out.length >= STANDARD_LEGAL_PAGES.length + MAX_CUSTOM_LEGAL_PAGES) continue;
    const page = rec(stored[key]);
    if (page.published === true && (!("doc" in page) || !isDocEmpty(sanitizeDoc(page.doc)))) out.push({ key, title: str(page.title, 120).trim() || key });
  }
  return out;
}

/** The three pages shoppers should see before paying, when published. */
export function checkoutLegalLinks(brandSettings: unknown) {
  const wanted = ["terms-of-service", "refund-policy", "privacy-policy"];
  return legalLinks(brandSettings).filter((link) => wanted.includes(link.key)).sort((a, b) => wanted.indexOf(a.key) - wanted.indexOf(b.key));
}

export interface TocEntry {
  id: string;
  text: string;
  /** 2 or 3: the HTML level the heading renders at. */
  level: 2 | 3;
}

/**
 * The table of contents: the document's top two heading levels (the editor's Heading 1 and 2, which render
 * as h2 and h3 under the page title), with the same ids renderDoc gives them.
 */
export function legalToc(doc: RichDoc): TocEntry[] {
  const nextId = headingIds();
  const out: TocEntry[] = [];
  const walk = (node: RichNode) => {
    if (node.type === "heading") {
      const text = plainText(node).trim();
      const id = nextId(plainText(node));
      const level = Math.min(6, Math.max(1, Math.round(Number(rec(node.attrs).level) || 2)) + 1);
      if (id && text && level <= 3) out.push({ id, text: text.slice(0, 120), level: level as 2 | 3 });
      return;
    }
    (node.content ?? []).forEach(walk);
  };
  doc.content.forEach(walk);
  return out;
}

// ─── Starter templates ───────────────────────────────────────────────────────

export interface LegalTemplateContext {
  storeName: string;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  /** The store's web address. */
  storeUrl?: string | null;
  delivery?: Array<{ name: string; regions?: string[]; fee: number | null; freeOver: number | null; alwaysFree?: boolean; estimatedDays: string | null }>;
  flatRate?: number | null;
  payOnDelivery?: boolean;
  paymentLabels?: string[];
}

const naira = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

/** "[Check: …]" marks every guess the seller must confirm. */
const check = (text: string) => `**[Check: ${text}]**`;

function contactLines(ctx: LegalTemplateContext) {
  const lines = [
    ctx.email ? `- Email: ${ctx.email}` : `- Email: ${check("add your business email")}`,
    ctx.phone ? `- Phone: ${ctx.phone}` : `- Phone: ${check("add a phone number customers can call")}`,
    ctx.whatsapp ? `- WhatsApp: +${ctx.whatsapp.replace(/^\+/, "")}` : "",
    `- Address: ${[ctx.city, ctx.country || "Nigeria"].filter(Boolean).join(", ")} ${check("add your full business address")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function deliveryTable(ctx: LegalTemplateContext) {
  const zones = ctx.delivery ?? [];
  if (!zones.length) {
    if (ctx.flatRate) return `We charge a flat delivery fee of ${naira(ctx.flatRate)} per order. ${check("is this still your delivery fee?")}`;
    return `${check("list the areas you deliver to, the fee for each and how long delivery takes")}`;
  }
  const rows = zones.slice(0, 20).map((zone) => {
    const fee = zone.alwaysFree ? "Free" : zone.fee !== null ? naira(zone.fee) : "Worked out at checkout";
    const free = zone.freeOver ? `Free over ${naira(zone.freeOver)}` : "";
    const where = zone.regions?.length ? `${zone.name} (${zone.regions.slice(0, 6).join(", ")})` : zone.name;
    return `| ${where.replace(/\|/g, "/")} | ${[fee, free].filter(Boolean).join(", ")} | ${zone.estimatedDays ?? "See checkout"} |`;
  });
  return ["| Where | Fee | Usually arrives in |", "| --- | --- | --- |", ...rows].join("\n");
}

const TEMPLATES: Record<StandardLegalKey, (ctx: LegalTemplateContext) => string> = {
  "privacy-policy": (ctx) => `# Who we are
${ctx.storeName} ("we", "us") runs this online store${ctx.city ? ` from ${ctx.city}` : ""}. This policy explains what personal data we collect when you shop with us, why we collect it and the choices you have. We follow the Nigeria Data Protection Act 2023.

# What we collect
- **Details you give us:** your name, phone number, email, delivery address and anything you write in order notes or messages.
- **Order details:** what you bought, how much you paid and how it was delivered.
- **Payment details:** payments are handled by our payment provider ${check("e.g. Paystack")}. We never see or keep your full card number.
- **Device details:** basic information such as your browser type and the pages you visit, so the store works and we can improve it.

# How we use it
- To process and deliver your orders and keep you updated about them.
- To answer your questions and handle returns or refunds.
- To send you offers, only if you agreed to hear from us. You can opt out at any time.
- To prevent fraud and to meet our legal and tax duties.

# Who we share it with
We only share what is needed with delivery partners, our payment provider, the platform that hosts our store, and authorities when the law requires it. We do not sell your personal data.

# How long we keep it
We keep order records for as long as the law requires for accounting ${check("usually 6 years")} and other data only while we need it.

# Your rights
You can ask us to show you the data we hold about you, correct it, delete it or stop using it for marketing. You can also complain to the Nigeria Data Protection Commission (NDPC). To make a request, contact us using the details below.

# Contact us
${contactLines(ctx)}`,

  "terms-of-service": (ctx) => `# About these terms
These terms apply when you buy from ${ctx.storeName}${ctx.storeUrl ? ` at ${ctx.storeUrl}` : ""}. By placing an order you agree to them. Your rights under the Federal Competition and Consumer Protection Act 2018 are not affected.

# Orders
- An order is confirmed once we receive payment${ctx.payOnDelivery ? " or, for pay on delivery orders, once we confirm it with you" : ""}.
- We may cancel an order if an item is out of stock or the price was shown wrongly. If you have paid, we refund you in full.

# Prices and payment
- Prices are in Naira and include any taxes we must charge ${check("confirm whether VAT is included")}.
- Delivery fees are shown at checkout before you pay.
- We accept ${ctx.paymentLabels?.length ? ctx.paymentLabels.join(", ").toLowerCase() : check("list the payment methods you accept")}.

# Delivery
Delivery times are estimates. See our [delivery policy](/policies/shipping-policy) for where we deliver and how long it takes.

# Returns and refunds
See our [returns and refunds policy](/policies/refund-policy).

# Products
We describe and photograph our products as accurately as we can. Colours may look slightly different on your screen.

# Our responsibility
We are responsible for losses that are a foreseeable result of us breaking these terms. We are not responsible for delays caused by events outside our control, such as strikes, bad roads or network outages.

# Disputes
If something goes wrong, please contact us first and we will try to sort it out quickly. These terms are governed by the laws of the Federal Republic of Nigeria${ctx.city ? `, and the courts of ${ctx.city}` : ""} ${check("pick the state whose courts handle disputes")}.

# Contact us
${contactLines(ctx)}`,

  "refund-policy": (ctx) => `# Returns
You can return most items within **7 days** of delivery ${check("set your return window")} if they are unused, in their original packaging and with proof of purchase.

We cannot take back ${check("list items you don't accept back, e.g. underwear, opened cosmetics, perishable food, custom-made items")}.

# How to return an item
1. Contact us within the return window with your order number and the reason for the return.
2. We will tell you where to send or drop off the item.
3. Once we receive and check the item, we will let you know if your refund is approved.

# Damaged or wrong items
If your item arrives damaged, faulty or is not what you ordered, tell us within **48 hours** of delivery with photos. We will replace it or refund you in full, including delivery.

# Refunds
- Approved refunds go back to your original payment method within **5 to 10 working days** ${check("confirm your refund timeline")}.
- Pay on delivery orders are refunded by bank transfer.
- Delivery fees are not refunded unless the item was damaged, faulty or wrong.

# Exchanges
Want a different size or colour? Contact us and we will arrange an exchange if it is in stock.

# Contact us
${contactLines(ctx)}`,

  "shipping-policy": (ctx) => `# Where we deliver
We deliver from ${ctx.city || check("your city")}${ctx.country ? `, ${ctx.country}` : ""} to the areas below.

${deliveryTable(ctx)}

# Processing time
Orders are packed within **1 to 2 working days** ${check("how long you take to pack an order")}. Orders placed on weekends or public holidays are packed the next working day.

# Delivery fees
Delivery fees are worked out at checkout from your address and shown before you pay.${ctx.payOnDelivery ? "\n\nPay on delivery is available in some areas; you will see it at checkout when it is." : ""}

# Tracking your order
We will send you updates by SMS, WhatsApp or email when your order is on its way.

# Delays and failed delivery
Delivery times are estimates and can be affected by traffic, weather or events outside our control. If the rider cannot reach you, we will try to contact you to arrange another delivery, which may cost extra.

# Contact us
${contactLines(ctx)}`,

  "cookie-policy": (ctx) => `# What cookies are
Cookies are small files a website saves in your browser. ${ctx.storeName} uses them so the store works properly and to understand how people use it.

# Cookies we use
| Type | What it does | Can you turn it off? |
| --- | --- | --- |
| Essential | Keeps your bag, checkout and sign-in working | No, the store needs these |
| Preferences | Remembers choices such as saved delivery details | Yes |
| Analytics | Counts visits and popular pages so we can improve | Yes |
| Marketing | Measures our adverts ${check("only if you use advert pixels such as Meta or Google")} | Yes |

# Managing cookies
You can delete or block cookies in your browser settings. If you block essential cookies, parts of the store, such as your bag, may stop working.

# Contact us
${contactLines(ctx)}`,

  "contact-information": (ctx) => `# ${ctx.storeName}
${contactLines(ctx)}

# Business details
- Registered business name: ${check("your CAC-registered name")}
- RC or BN number: ${check("your CAC registration number")}

# Opening hours
${check("e.g. Monday to Saturday, 9am to 6pm")}

We usually reply within one working day.`,
};

/** A callout at the top of every template, so a page is never published with guesses unread. */
const REVIEW_NOTE: RichNode = {
  type: "callout",
  attrs: { tone: "warning" },
  content: [{ type: "paragraph", content: [{ type: "text", text: "Draft from a template. Read it through, replace every [Check: …] with your own details, then delete this note before you publish. This is a starting point, not legal advice." }] }],
};

/** A starter document for a standard page, filled in with what we know about the store. */
export function legalTemplate(key: string, ctx: LegalTemplateContext): RichDoc | null {
  if (!isStandardLegalKey(key)) return null;
  const doc = sanitizeDoc(markdownToDoc(TEMPLATES[key](ctx)));
  return withReviewNote(doc);
}

export function withReviewNote(doc: RichDoc): RichDoc {
  return { type: "doc", content: [REVIEW_NOTE, ...doc.content] };
}
