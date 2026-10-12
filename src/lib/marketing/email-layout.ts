// The marketing email wrapper and the starter template library. Pure (no server imports), unit-tested.
// Templates are stored as body HTML with {{variables}}; wrapEmail puts the shop's logo, brand colours and the
// compliance footer around them at send time and in previews (on the shared shell, src/lib/email/shell.ts), so a
// brand kit or business address change shows up in every email.

import { BLEED_MARK, readTheme, themePalette } from "./blocks.ts";
import { EMAIL_DARK, emailDocument, storeFooter, storeHeader, type EmailKind, type StoreSender } from "../email/shell.ts";

// ─── Pasted full-HTML templates ─────────────────────────────────────────────────

/** Saved at the start of a pasted template when the seller switched "Add my logo header" off in the builder. */
export const LOGO_OFF_MARK = "<!--sib-logo:off-->";
const BRAND_HEADER_MARK = "<!--sib-brand-header-->";

/** A whole HTML document (pasted), rather than body content the shell lays out. */
export function isFullDocument(html: string) {
  return /<html[\s>]/i.test(html);
}

export function logoHeaderOn(html: string) {
  return !html.includes(LOGO_OFF_MARK);
}

/** Turns the builder's "Add my logo header" switch on (default) or off for a pasted template. */
export function setLogoHeader(html: string, on: boolean) {
  const clean = html.split(LOGO_OFF_MARK).join("");
  return on ? clean : `${LOGO_OFF_MARK}${clean}`;
}

// ─── Dark mode for pasted documents ──────────────────────────────────────────────
// The seller's own colours are never rewritten: forcing dark styles onto arbitrary HTML breaks designs, and Apple
// Mail, Outlook and Gmail adapt a document themselves once it declares color-scheme. We declare it (when the
// document doesn't say anything about dark mode itself) and make only the parts we inject (the logo header and
// the compliance footer) follow dark mode: the shell's dark palette on their own band, and the logo swap.

/** Saved at the start of a pasted template when the seller switched "Optimise for dark mode" off in the builder. */
export const DARK_OFF_MARK = "<!--sib-dark:off-->";
const DARK_STYLE_MARK = "sib-pasted-dark";

export function darkModeOn(html: string) {
  return !html.includes(DARK_OFF_MARK);
}

/** Turns the builder's "Optimise for dark mode" switch on (default) or off for a pasted template. */
export function setDarkMode(html: string, on: boolean) {
  const clean = html.split(DARK_OFF_MARK).join("");
  return on ? clean : `${DARK_OFF_MARK}${clean}`;
}

/**
 * What the pasted document already says about dark mode:
 * - "none": nothing (no color-scheme meta or CSS property, no prefers-color-scheme rules);
 * - "dark": it handles dark mode itself (prefers-color-scheme rules, or a color-scheme that includes dark);
 * - "light-only": it declares color-scheme without dark (it opted out: stays light everywhere).
 * Comments are ignored, so a commented-out rule doesn't count.
 */
export function documentDarkMode(doc: string): "none" | "dark" | "light-only" {
  const code = doc.replace(/<!--[\s\S]*?-->/g, "");
  const schemes: string[] = [];
  for (const meta of code.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\bname\s*=\s*["']?(?:color-scheme|supported-color-schemes)\b/i.test(meta)) continue;
    schemes.push(meta.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find((v) => v !== undefined) ?? "");
  }
  for (const css of code.match(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi) ?? []) {
    if (/prefers-color-scheme/i.test(css)) return "dark";
    for (const match of css.matchAll(/(?:^|[;{\s])(?:supported-)?color-scheme\s*:\s*([^;}!]+)/gi)) schemes.push(match[1]);
  }
  for (const match of code.matchAll(/\sstyle\s*=\s*"[^"]*\bcolor-scheme\s*:\s*([^;"]+)/gi)) schemes.push(match[1]);
  if (!schemes.length) return "none";
  return schemes.some((value) => /\bdark\b/i.test(value)) ? "dark" : "light-only";
}

/** Gives a document a <head> (after <html>, or at the very start), so metas and styles have a place. */
export function ensureHead(doc: string) {
  if (/<head[\s>]/i.test(doc)) return doc;
  if (/<html\b[^>]*>/i.test(doc)) return doc.replace(/<html\b[^>]*>/i, (tag) => `${tag}\n<head></head>`);
  return `<head></head>\n${doc}`;
}

/**
 * Dark-mode rules for the parts we inject into a pasted document, and nothing else: the header and footer become
 * a band in the shell's dark page colour (readable whatever the seller's page does), with light text and the
 * white "Sent with Shopinbos" logo. Outlook.com's [data-ogsc]/[data-ogsb] get the same.
 */
export function injectedDarkCss() {
  const d = EMAIL_DARK;
  const rules = (scope: string, bgScope: string) => `${bgScope} .sib-brand-header,${bgScope} table.sib-foot{background:${d.page}!important}
${scope} .sib-brand-header .sib-store-name{color:${d.ink}!important}
${scope} .sib-brand-header .sib-chip{background:#FFFFFF!important;padding:6px 10px!important;border-radius:10px!important}
${scope} .sib-foot,${scope} .sib-foot p,${scope} .sib-foot td{color:${d.muted}!important}
${scope} .sib-foot a,${scope} .sib-foot .sib-foot-strong{color:${d.ink}!important}
${scope} .sib-foot .sib-logo-light{display:none!important}
${scope} .sib-foot .sib-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}`;
  return `<style id="${DARK_STYLE_MARK}">
@media (prefers-color-scheme:dark){
${rules("", "")}
}
${rules("[data-ogsc]", "[data-ogsb]")}
</style>`;
}

const COLOR_SCHEME_METAS = '<meta name="color-scheme" content="light dark" />\n<meta name="supported-color-schemes" content="light dark" />';

/**
 * Dark-mode support for a pasted document. With nothing of its own: color-scheme metas plus the rules for our
 * injected parts. When it handles dark mode itself: only our rules (they follow its prefers-color-scheme). When it
 * opted out (color-scheme light only): nothing. The seller's colours are left alone in every case.
 */
export function addDarkModeSupport(doc: string) {
  if (doc.includes(`id="${DARK_STYLE_MARK}"`)) return doc;
  const own = documentDarkMode(doc);
  if (own === "light-only") return doc;
  const head = (own === "none" ? `${COLOR_SCHEME_METAS}\n` : "") + injectedDarkCss();
  const withHead = ensureHead(doc);
  // Our <style> goes last in <head> so it wins ties; the metas go first, where clients look for them.
  const close = withHead.search(/<\/head\s*>/i);
  if (close >= 0) return `${withHead.slice(0, close)}${head}\n${withHead.slice(close)}`;
  return withHead.replace(/<head\b[^>]*>/i, (tag) => `${tag}\n${head}`);
}

/** Gives a document with no <body> one (after </head>, or after <html>), so the header and footer have a place. */
export function ensureBody(doc: string) {
  if (/<body[\s>]/i.test(doc)) return doc;
  let out = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, "</head>\n<body>") : /<html\b[^>]*>/i.test(doc) ? doc.replace(/<html\b[^>]*>/i, (tag) => `${tag}\n<body>`) : `<body>\n${doc}`;
  const end = out.search(/<\/html>(?![\s\S]*<\/html>)/i);
  out = end >= 0 ? `${out.slice(0, end)}</body>\n${out.slice(end)}` : `${out}\n</body>`;
  return out;
}

/** The store's logo (or its name as text) centred in a 600px table, for the top of a pasted document. */
export function brandHeaderHtml(input: { name: string; logoUrl?: string | null; href?: string | null }) {
  return `${BRAND_HEADER_MARK}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sib-brand-header"><tr><td align="center" style="padding:20px 12px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto"><tr><td align="center" style="text-align:center">${storeHeader({ name: input.name, logoUrl: input.logoUrl, href: input.href, align: "center" })}</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`;
}

/** Puts the brand header right after <body>, unless it's there already or the document already shows the logo. */
export function injectBrandHeader(doc: string, input: { name: string; logoUrl?: string | null; href?: string | null }) {
  if (doc.includes(BRAND_HEADER_MARK)) return doc;
  const logo = input.logoUrl?.trim();
  if (logo && (doc.includes(logo) || doc.includes(logo.replace(/&/g, "&amp;")))) return doc;
  const withBody = ensureBody(doc);
  return withBody.replace(/<body\b[^>]*>/i, (tag) => `${tag}\n${brandHeaderHtml(input)}`);
}

// ─── Duplicate footer text ─────────────────────────────────────────────────────

const APOS = "(?:'|&#39;|&#x27;|&apos;|’)";
/** The footer block's old default line (and the library's), after {{store}} is filled in. */
const LEGACY_LEAD = `You${APOS}re (?:getting|receiving) this(?: email)? because you (?:shop with|bought from|subscribed to) [^<]{1,200}?\\.`;
const LEGACY_REASON = [new RegExp(`${LEGACY_LEAD}\\s+(?=Reply to this email)`, "g"), new RegExp(`${LEGACY_LEAD}(?=\\s*(?:<br>|</p>|$))`, "g")];
/** The footer block's "Unsubscribe" link (exactly as blocks.ts draws it), with the line break before it. */
const BLOCK_UNSUBSCRIBE = /(?:<br>)?<a href="[^"]*" style="color:[^";]*">Unsubscribe<\/a>(?=<\/p>)/g;
const EMPTY_FOOTER_P = /<p style="margin:(?:24px 0 0|0);font-size:12\.5px;line-height:1\.6;color:[^"]*">\s*<\/p>/g;

/** Removes a template's own compliance lines when the shell's footer is added (designed sign-offs stay). */
export function stripDuplicateCompliance(html: string) {
  return LEGACY_REASON.reduce((out, re) => out.replace(re, ""), html).replace(BLOCK_UNSUBSCRIBE, "").replace(EMPTY_FOOTER_P, "");
}

export interface EmailBrand {
  storeName: string;
  logoUrl?: string | null;
  /** Buttons and links. */
  accent: string;
  /** Text colour. */
  ink: string;
  /** Page background behind the white card. */
  paper: string;
}

export const DEFAULT_BRAND: EmailBrand = { storeName: "Your shop", logoUrl: null, accent: "#FF6A2B", ink: "#16141F", paper: "#F6F5F9" };

const color = (value: string, fallback: string) => (/^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : fallback);

/** The compliance footer under a store's email (see src/lib/email/shell.ts). */
export interface EmailCompliance {
  appUrl: string;
  sender: StoreSender;
  kind?: EmailKind;
  reason?: string | null;
  unsubscribeUrl?: string | null;
  preferencesUrl?: string | null;
}

/**
 * Full HTML document on the shared shell: brand header (logo or name), the body in a card, brand colours on
 * links, the compliance footer, and light/dark support (the page, header and footer follow dark mode; the card
 * keeps the colours it was designed with). A body written with a style family (see blocks.ts themes) gets that
 * family's card, page and fonts; a full-bleed hero at the top runs edge to edge in its own row.
 */
export function wrapEmail({ bodyHtml, brand, preheader, compliance }: { bodyHtml: string; brand: EmailBrand; preheader?: string | null; compliance?: EmailCompliance | null }) {
  const accent = color(brand.accent, DEFAULT_BRAND.accent);
  const theme = themePalette(readTheme(bodyHtml));
  const ink = theme.ink ?? color(brand.ink, DEFAULT_BRAND.ink);
  const paper = theme.page ?? color(brand.paper, DEFAULT_BRAND.paper);
  const footer = compliance
    ? storeFooter({
        appUrl: compliance.appUrl,
        store: compliance.sender,
        kind: compliance.kind ?? "marketing",
        reason: compliance.reason,
        unsubscribeUrl: compliance.unsubscribeUrl,
        preferencesUrl: compliance.preferencesUrl,
        tone: theme.dark ? "dark" : "light",
      })
    : "";
  // The shell adds the compliance footer, so the template's own "why you're getting this" line and unsubscribe
  // link (the footer block's, or the old library text) would say it twice.
  const content = footer ? stripDuplicateCompliance(bodyHtml) : bodyHtml;
  // A full document already (pasted HTML): add the brand header (unless switched off or the logo is already in it),
  // the brand colour and the footer, and leave its layout alone.
  if (isFullDocument(content)) {
    const logoOn = logoHeaderOn(content);
    const darkOn = darkModeOn(content);
    // The switches' markers have done their job; they never go out (a comment before the doctype can upset clients).
    let doc = ensureBody(content.split(LOGO_OFF_MARK).join("").split(DARK_OFF_MARK).join("").replace(/{{\s*brand_accent\s*}}/g, accent));
    if (logoOn) doc = injectBrandHeader(doc, { name: brand.storeName, logoUrl: brand.logoUrl, href: compliance?.sender.websiteUrl ?? null });
    if (darkOn) doc = addDarkModeSupport(doc);
    if (!footer) return doc;
    const close = doc.search(/<\/body>(?![\s\S]*<\/body>)/i);
    return close >= 0 ? `${doc.slice(0, close)}${footer}${doc.slice(close)}` : doc + footer;
  }
  const logo = storeHeader({
    name: brand.storeName,
    logoUrl: brand.logoUrl,
    ink,
    font: theme.body,
    align: theme.logoAlign,
    nameStyle: theme.head.includes("font-family") ? theme.head.replace(/;text-transform:uppercase/, "") : "",
  });
  const body = content.replace(/{{\s*brand_accent\s*}}/g, accent);
  const cell = `background:${theme.card};font-family:${theme.body};font-size:16px;line-height:1.6;color:${ink}`;
  const radius = theme.radius + 4;
  const split = body.indexOf(BLEED_MARK);
  const card =
    split >= 0
      ? `<tr><td class="sib-card" bgcolor="${theme.card}" style="${cell};padding:0;border-radius:${radius}px ${radius}px 0 0;overflow:hidden">
${body.slice(0, split)}
</td></tr>
<tr><td class="sib-card sib-pad" bgcolor="${theme.card}" style="${cell};padding:6px 28px 30px;border-radius:0 0 ${radius}px ${radius}px">
${body.slice(split + BLEED_MARK.length)}
</td></tr>`
      : `<tr><td class="sib-card sib-pad" bgcolor="${theme.card}" style="${cell};border-radius:${radius}px;padding:30px 28px">
${body}
</td></tr>`;
  return emailDocument({
    title: brand.storeName,
    preheader,
    header: logo,
    headerAlign: theme.logoAlign,
    card,
    cardIsRows: true,
    footer,
    page: paper,
    adaptCard: false,
    scheme: theme.dark ? "dark" : "light dark",
    // Always-dark styles keep their own page in dark mode too.
    extraCss: `@media only screen and (max-width:480px){.sib-col{max-width:100%!important}}
a{color:${accent}}${theme.dark ? `\n@media (prefers-color-scheme:dark){.sib-page{background:${paper}!important}}` : ""}`,
  });
}

export { TEMPLATE_LIBRARY, TEMPLATE_CATEGORIES, nearestStarter, type LibraryTemplate, type TemplateCategory } from "./template-library.ts";

/** Sample values for previews, so a preview never pretends a real customer got it. */
export const SAMPLE_VARIABLES = {
  name: "Ada",
  full_name: "Ada Okafor",
  cart_items: "Ankara wrap dress × 1, Leather sandals × 1",
  cart_total: "₦38,500",
  order_number: "SIB-10234",
  order_total: "₦38,500",
  product_name: "Ankara wrap dress",
  discount_code: "WELCOME-7Q2K",
  currency: "NGN",
} as const;
