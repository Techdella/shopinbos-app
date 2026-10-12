// The one email shell every message goes through: Shopinbos's own notices to sellers, suppliers, delivery partners
// and admins (A), and a store's emails to its customers (B), transactional or marketing. Pure (no server imports),
// so it is unit-tested in tests/email-compliance.test.mjs and the marketing builder can render previews in the browser.
//
// What it guarantees:
// - a logo in the header (Shopinbos for A; the store's logo or name for B, with a small "Sent with Shopinbos" mark);
// - light and dark mode: color-scheme metas, a prefers-color-scheme block plus Outlook.com's [data-ogsc]/[data-ogsb]
//   selectors, and a light/dark logo pair (the light one is the fallback for clients that ignore media queries);
// - a table layout, 600px wide, responsive, with a hidden preheader;
// - the compliance footer: who sent it and their postal address, why the reader got it, contact and privacy links,
//   and for marketing and lifecycle mail both "Unsubscribe" and "Update preferences".

export type EmailKind =
  /** Receipts, password and security, order status: no opt-out, a "service message" line instead. */
  | "transactional"
  /** Account activity people can tune (new order alerts, unread messages): a link to their notification settings. */
  | "notification"
  /** Onboarding and lifecycle nudges from Shopinbos: unsubscribe + preferences + List-Unsubscribe headers. */
  | "lifecycle"
  /** A store's campaigns and automations: unsubscribe + preferences + List-Unsubscribe headers. */
  | "marketing";

export function needsUnsubscribe(kind: EmailKind) {
  return kind === "marketing" || kind === "lifecycle";
}

export const EMAIL_COLORS = {
  navy: "#0E2A38",
  mint: "#73D8C8",
  cream: "#F4F1EA",
  paper: "#FAF7F1",
  teal: "#2E7E78",
  tealDeep: "#1F5F5A",
  muted: "#6E6E68",
  line: "#E7E1D5",
  soft: "#F4F1EA",
  coral: "#E86A4F",
  amber: "#F2A93B",
} as const;

/** Dark-mode palette (applied by the media query, never inline). */
export const EMAIL_DARK = { page: "#0A1C25", card: "#12303F", ink: "#F4F1EA", muted: "#A9B8BB", line: "#25455A", soft: "#0E2A38", link: "#73D8C8" } as const;

export const FONT = "'Space Grotesk','Segoe UI',Helvetica,Arial,sans-serif";
export const MONO = "'JetBrains Mono',ui-monospace,Menlo,Consolas,'Courier New',monospace";
export const ACCENT_FONT = "Fraunces,Georgia,'Times New Roman',serif";

/** The legal footer for Shopinbos's own emails. SHOPINBOS_LEGAL_NAME / SHOPINBOS_POSTAL_ADDRESS override it. */
export const SHOPINBOS_LEGAL_DEFAULTS = {
  name: "Shopinbos, a product of Tech Della Solutions LTD (RC 7038770)",
  address: "Office 7B, Yemtob Plaza, Elewure, Off Akala Express, Oluyole, Ibadan, Oyo State, Nigeria, 200257",
} as const;

export const SHOPINBOS_SUPPORT_EMAIL = "support@shopinbos.com";
export const SHOPINBOS_PRIVACY_URL = "https://shopinbos.com/privacy";

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESC[ch]);
}

/** Only http(s) and mailto links make it into an href; anything else becomes "#". */
export function safeHref(url: string | null | undefined) {
  const value = String(url ?? "").trim();
  if (value === "#") return "#";
  return /^(https?:\/\/|mailto:)/i.test(value) ? escapeHtml(value) : "#";
}

function hex(value: string | null | undefined, fallback: string) {
  const v = String(value ?? "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
}

export function cleanAppUrl(appUrl: string | null | undefined) {
  const value = String(appUrl ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(value) ? value : "https://app.shopinbos.com";
}

// ─── Logos ────────────────────────────────────────────────────────────────────

/** Email-sized retina PNGs (419×40) in public/brand/email: navy for light backgrounds, white for dark ones. */
export function shopinbosLogo(appUrl: string) {
  const base = cleanAppUrl(appUrl);
  return {
    light: `${base}/brand/email/shopinbos-logo-navy@2x.png`,
    dark: `${base}/brand/email/shopinbos-logo-white@2x.png`,
    alt: "Shopinbos",
  };
}

/** A light/dark image pair: the light one shows by default, the dark one only when the client is in dark mode. */
export function logoPair(input: { light: string; dark: string; alt: string; width: number; height: number; href?: string | null; align?: "left" | "center" }) {
  const img = (src: string) =>
    `<img src="${escapeHtml(src)}" width="${input.width}" height="${input.height}" alt="${escapeHtml(input.alt)}" style="display:block;width:${input.width}px;height:${input.height}px;max-width:100%;border:0;outline:none;text-decoration:none${input.align === "center" ? ";margin:0 auto" : ""}" />`;
  const wrap = (inner: string) => (input.href ? `<a href="${safeHref(input.href)}" style="text-decoration:none;border:0">${inner}</a>` : inner);
  return `<div class="sib-logo-light">${wrap(img(input.light))}</div><!--[if !mso]><!--><div class="sib-logo-dark" style="display:none;max-height:0;overflow:hidden;mso-hide:all">${wrap(img(input.dark))}</div><!--<![endif]-->`;
}

export function shopinbosHeader(appUrl: string, align: "left" | "center" = "left") {
  const logo = shopinbosLogo(appUrl);
  return logoPair({ ...logo, width: 210, height: 20, href: cleanAppUrl(appUrl), align });
}

/** A store's header: its https logo (on a white chip in dark mode, so a dark logo stays visible), else its name. */
export function storeHeader(input: { name: string; logoUrl?: string | null; href?: string | null; ink?: string; font?: string; align?: "left" | "center"; nameStyle?: string }) {
  const align = input.align ?? "left";
  const link = (inner: string) => (input.href ? `<a href="${safeHref(input.href)}" style="text-decoration:none;border:0;color:inherit">${inner}</a>` : inner);
  if (input.logoUrl && /^https:\/\//i.test(input.logoUrl)) {
    return link(
      `<img class="sib-chip" src="${escapeHtml(input.logoUrl)}" height="44" alt="${escapeHtml(input.name)}" style="display:${align === "center" ? "inline-block" : "block"};height:44px;width:auto;max-width:200px;object-fit:contain;border:0;outline:none;text-decoration:none" />`,
    );
  }
  return link(
    `<span class="sib-store-name" style="font-family:${input.font ?? FONT};font-size:21px;font-weight:700;letter-spacing:-0.3px;color:${hex(input.ink, EMAIL_COLORS.navy)}${input.nameStyle ?? ""}">${escapeHtml(input.name)}</span>`,
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export interface FooterInput {
  kind: EmailKind;
  /** The sender's business (legal) name. */
  senderName: string;
  /** Full postal address. Left out of the footer when empty (never invented). */
  address?: string | null;
  /** Why the reader got this, as a full sentence. */
  reason: string;
  unsubscribeUrl?: string | null;
  preferencesUrl?: string | null;
  /** Label for the preferences link ("Update preferences", "Notification settings"). */
  preferencesLabel?: string;
  contactUrl?: string | null;
  contactLabel?: string;
  privacyUrl?: string | null;
  /** Transactional mail: "This is a service message about your order." */
  serviceNote?: string | null;
  /** The small "Sent with Shopinbos" mark (B emails), with the app URL its logo comes from. */
  poweredBy?: { appUrl: string } | null;
  /** "dark" when the footer sits on a dark page in light mode too (a dark marketing theme). */
  tone?: "light" | "dark";
}

const sep = '<span class="sib-foot-sep" style="padding:0 6px">·</span>';

export function footerHtml(input: FooterInput) {
  const dark = input.tone === "dark";
  const text = dark ? "#A39C90" : EMAIL_COLORS.muted;
  const strong = dark ? "#F3EDE3" : EMAIL_COLORS.navy;
  const linkStyle = `color:${strong};text-decoration:underline`;
  const a = (href: string | null | undefined, label: string, cls = "") => `<a href="${safeHref(href)}" class="sib-foot-link${cls}" style="${linkStyle}">${escapeHtml(label)}</a>`;

  const rows: string[] = [];
  rows.push(`<p style="margin:0 0 10px">${escapeHtml(input.reason)}</p>`);
  if (needsUnsubscribe(input.kind)) {
    rows.push(`<p style="margin:0 0 10px">${a(input.unsubscribeUrl, "Unsubscribe", " sib-unsubscribe")}${sep}${a(input.preferencesUrl, input.preferencesLabel ?? "Update preferences", " sib-preferences")}</p>`);
  } else if (input.kind === "notification" && input.preferencesUrl) {
    rows.push(`<p style="margin:0 0 10px">${a(input.preferencesUrl, input.preferencesLabel ?? "Manage email notifications", " sib-preferences")}</p>`);
  }
  if (input.kind === "transactional" && input.serviceNote) rows.push(`<p style="margin:0 0 10px">${escapeHtml(input.serviceNote)}</p>`);
  const links = [input.contactUrl ? a(input.contactUrl, input.contactLabel ?? "Contact us") : "", input.privacyUrl ? a(input.privacyUrl, "Privacy policy") : ""].filter(Boolean);
  if (links.length) rows.push(`<p style="margin:0 0 10px">${links.join(sep)}</p>`);
  const address = String(input.address ?? "").replace(/\s*\n\s*/g, ", ").trim();
  rows.push(
    `<p class="sib-sender" style="margin:0">${`<strong class="sib-foot-strong" style="color:${strong};font-weight:600">${escapeHtml(input.senderName)}</strong>`}${address ? `<br><span class="sib-address">${escapeHtml(address)}</span>` : ""}</p>`,
  );
  if (input.poweredBy) {
    const logo = shopinbosLogo(input.poweredBy.appUrl);
    rows.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 0"><tr><td style="font-family:${FONT};font-size:11px;color:${text};padding:0 7px 0 0;vertical-align:middle" class="sib-foot">Sent with</td><td style="vertical-align:middle">${logoPair({ light: dark ? logo.dark : logo.light, dark: logo.dark, alt: "Shopinbos", width: 105, height: 10, href: "https://shopinbos.com" })}</td></tr></table>`,
    );
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sib-foot"><tr><td align="center" class="sib-foot" style="padding:22px 18px 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${text};text-align:center">
${rows.join("\n")}
</td></tr></table>`;
}

// ─── Document ─────────────────────────────────────────────────────────────────

/** Rules that turn the shell dark. `adaptCard` also darkens the card (only for content the shell controls). */
function darkRules(scope: string, adaptCard: boolean) {
  const d = EMAIL_DARK;
  const card = adaptCard
    ? `${scope} .sib-card{background:${d.card}!important;color:${d.ink}!important;border-color:${d.line}!important}
${scope} .sib-ink{color:${d.ink}!important}
${scope} .sib-muted{color:${d.muted}!important}
${scope} .sib-line{border-color:${d.line}!important}
${scope} .sib-soft{background:${d.soft}!important;border-color:${d.line}!important}
${scope} .sib-link{color:${d.link}!important}
${scope} .sib-btn{background:${EMAIL_COLORS.mint}!important;color:${EMAIL_COLORS.navy}!important;border-color:${EMAIL_COLORS.mint}!important}
${scope} .sib-code{background:${d.soft}!important;color:${EMAIL_COLORS.mint}!important;border-color:${d.line}!important}`
    : "";
  return `${scope} .sib-page{background:${d.page}!important}
${scope} .sib-foot,${scope} .sib-foot p,${scope} .sib-foot td{color:${d.muted}!important}
${scope} .sib-foot a,${scope} .sib-foot-strong{color:${d.ink}!important}
${scope} .sib-store-name{color:${d.ink}!important}
${scope} .sib-chip{background:#FFFFFF!important;padding:6px 10px!important;border-radius:10px!important}
${scope} .sib-logo-light{display:none!important}
${scope} .sib-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}
${card}`;
}

export function emailHead(input: { title: string; scheme?: "light dark" | "dark"; adaptCard?: boolean; extraCss?: string }) {
  const scheme = input.scheme ?? "light dark";
  const adapt = input.adaptCard ?? true;
  return `<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no" />
<meta name="color-scheme" content="${scheme}" />
<meta name="supported-color-schemes" content="${scheme}" />
<title>${escapeHtml(input.title)}</title>
<!--[if mso]><style>table,td,div,p,a,span{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
<style>
:root{color-scheme:${scheme};supported-color-schemes:${scheme}}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media only screen and (max-width:620px){
.sib-wrap{padding:16px 10px!important}
.sib-pad{padding:26px 20px!important}
.sib-col{max-width:100%!important}
.sib-h1{font-size:23px!important}
.sib-btn{display:block!important;text-align:center!important}
}
@media (prefers-color-scheme:dark){
${darkRules("", adapt)}
}
${darkRules("[data-ogsc]", adapt).replace(/\[data-ogsc\] \.sib-(page|card|soft|code)\{background/g, "[data-ogsb] .sib-$1{background")}
${input.extraCss ?? ""}
</style>
</head>`;
}

export function preheaderHtml(text: string | null | undefined) {
  if (!text) return "";
  // The trailing spacer stops clients pulling body text into the inbox preview after the preheader.
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(text)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>`;
}

export interface DocumentInput {
  title: string;
  preheader?: string | null;
  /** Header cell content (a logo). */
  header: string;
  headerAlign?: "left" | "center";
  /** Rows of the card (each `<tr>…</tr>`), or plain inner HTML (wrapped in one padded row). */
  card: string;
  cardIsRows?: boolean;
  footer: string;
  page?: string;
  cardBg?: string;
  ink?: string;
  font?: string;
  radius?: number;
  /** The card follows dark mode (shell-built content). Marketing bodies keep their designed colours. */
  adaptCard?: boolean;
  scheme?: "light dark" | "dark";
  extraCss?: string;
  cardBorder?: boolean;
}

export function emailDocument(input: DocumentInput) {
  const page = hex(input.page, EMAIL_COLORS.paper);
  const cardBg = hex(input.cardBg, "#FFFFFF");
  const ink = hex(input.ink, EMAIL_COLORS.navy);
  const font = input.font ?? FONT;
  const radius = input.radius ?? 18;
  const border = input.cardBorder === false ? "" : `;border:1px solid ${EMAIL_COLORS.line}`;
  const card = input.cardIsRows
    ? input.card
    : `<tr><td class="sib-card sib-pad" bgcolor="${cardBg}" style="background:${cardBg};border-radius:${radius}px${border};padding:34px 32px;font-family:${font};font-size:15px;line-height:1.6;color:${ink}">
${input.card}
</td></tr>`;
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
${emailHead({ title: input.title, scheme: input.scheme, adaptCard: input.adaptCard, extraCss: input.extraCss })}
<body class="sib-page" style="margin:0;padding:0;background:${page};word-spacing:normal">
${preheaderHtml(input.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sib-page" bgcolor="${page}" style="background:${page}"><tr><td align="center" class="sib-wrap" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto">
<tr><td style="padding:4px 6px 20px${input.headerAlign === "center" ? ";text-align:center" : ""}" align="${input.headerAlign ?? "left"}">${input.header}</td></tr>
${card}
<tr><td>${input.footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

// ─── Content helpers (escape everything they're given) ──────────────────────────

export const html = {
  eyebrow: (text: string) => `<p class="sib-eyebrow" style="margin:0 0 10px;font-family:${MONO};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLORS.teal}">${escapeHtml(text)}</p>`,
  h1: (text: string) => `<h1 class="sib-ink sib-h1" style="margin:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.5px;color:${EMAIL_COLORS.navy}">${escapeHtml(text)}</h1>`,
  p: (text: string) => `<p class="sib-ink" style="margin:0 0 14px;color:${EMAIL_COLORS.navy}">${escapeHtml(text)}</p>`,
  /** A paragraph from trusted, already-escaped HTML. */
  raw: (inner: string) => `<p class="sib-ink" style="margin:0 0 14px;color:${EMAIL_COLORS.navy}">${inner}</p>`,
  /** Plain text with blank lines as paragraph breaks. */
  text: (text: string) =>
    String(text ?? "")
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => `<p class="sib-ink" style="margin:0 0 14px;color:${EMAIL_COLORS.navy}">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
      .join(""),
  small: (text: string) => `<p class="sib-muted" style="margin:0 0 12px;font-size:13px;color:${EMAIL_COLORS.muted}">${escapeHtml(text)}</p>`,
  button: (label: string, url: string, color?: { bg?: string; fg?: string; brand?: boolean }) => {
    const bg = hex(color?.bg, EMAIL_COLORS.navy);
    const fg = hex(color?.fg, EMAIL_COLORS.cream);
    // Store-coloured buttons keep their colour in dark mode; Shopinbos's navy button turns mint.
    const cls = color?.brand ? "sib-btn-store" : "sib-btn";
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px"><tr><td style="border-radius:999px" bgcolor="${bg}"><a href="${safeHref(url)}" class="${cls}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${bg};border:1px solid ${bg};color:${fg};font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
  },
  quote: (inner: string) => `<div class="sib-soft" style="margin:0 0 16px;padding:14px 16px;border-radius:14px;background:${EMAIL_COLORS.soft};border:1px solid ${EMAIL_COLORS.line}">${inner}</div>`,
  code: (code: string) => `<p class="sib-code" style="margin:6px 0 18px;padding:16px 18px;border-radius:14px;background:${EMAIL_COLORS.soft};border:1px solid ${EMAIL_COLORS.line};font-family:${MONO};font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;color:${EMAIL_COLORS.navy}">${escapeHtml(code)}</p>`,
  divider: () => `<div class="sib-line" style="height:0;border-top:1px solid ${EMAIL_COLORS.line};margin:20px 0"></div>`,
  list: (items: string[]) => (items.length ? `<ul class="sib-ink" style="margin:0 0 16px;padding-left:20px;color:${EMAIL_COLORS.navy}">${items.map((item) => `<li style="margin:0 0 4px">${escapeHtml(item)}</li>`).join("")}</ul>` : ""),
  /** Label/value rows (order lines, totals). `strong` rows are bold with a rule above. */
  rows: (rows: Array<{ label: string; value: string; strong?: boolean; muted?: boolean }>) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px">${rows
      .map(
        (row) =>
          `<tr><td class="${row.muted ? "sib-muted" : "sib-ink"} sib-line" style="padding:9px 0;border-${row.strong ? "top" : "bottom"}:1px solid ${EMAIL_COLORS.line};font-size:${row.strong ? 16 : 14}px;${row.strong ? "font-weight:700;" : ""}color:${row.muted ? EMAIL_COLORS.muted : EMAIL_COLORS.navy}">${escapeHtml(row.label)}</td><td align="right" class="${row.muted ? "sib-muted" : "sib-ink"} sib-line" style="padding:9px 0 9px 12px;border-${row.strong ? "top" : "bottom"}:1px solid ${EMAIL_COLORS.line};font-size:${row.strong ? 16 : 14}px;${row.strong ? "font-weight:700;" : ""}white-space:nowrap;text-align:right;color:${row.muted ? EMAIL_COLORS.muted : EMAIL_COLORS.navy}">${escapeHtml(row.value)}</td></tr>`,
      )
      .join("")}</table>`,
};

// ─── Shopinbos → our users (A) ──────────────────────────────────────────────────

export interface PlatformLegal {
  name: string;
  address: string | null;
}

export interface PlatformEmailInput {
  appUrl: string;
  kind: EmailKind;
  title?: string;
  preheader?: string | null;
  eyebrow?: string | null;
  heading: string;
  /** Inner HTML built with the `html` helpers (escaped). */
  bodyHtml: string;
  cta?: { label: string; url: string } | null;
  /** "you have a Shopinbos seller account" → "You're receiving this because you have a Shopinbos seller account." */
  reason: string;
  legal: PlatformLegal;
  unsubscribeUrl?: string | null;
  preferencesUrl?: string | null;
  serviceNote?: string | null;
  contactUrl?: string | null;
  privacyUrl?: string | null;
}

export function platformEmail(input: PlatformEmailInput) {
  const appUrl = cleanAppUrl(input.appUrl);
  const body = `${input.eyebrow ? html.eyebrow(input.eyebrow) : ""}${html.h1(input.heading)}${input.bodyHtml}${input.cta ? html.button(input.cta.label, input.cta.url) : ""}`;
  const footer = footerHtml({
    kind: input.kind,
    senderName: input.legal.name,
    address: input.legal.address,
    reason: reasonSentence(input.reason),
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesUrl: input.preferencesUrl,
    preferencesLabel: input.kind === "notification" ? "Manage email notifications" : "Update preferences",
    serviceNote: input.serviceNote ?? (input.kind === "transactional" ? "This is a service message about your Shopinbos account. You get these even if you unsubscribe from updates." : null),
    contactUrl: input.contactUrl ?? `mailto:${SHOPINBOS_SUPPORT_EMAIL}`,
    contactLabel: "Contact support",
    privacyUrl: input.privacyUrl ?? SHOPINBOS_PRIVACY_URL,
  });
  return emailDocument({ title: input.title ?? input.heading, preheader: input.preheader, header: shopinbosHeader(appUrl), card: body, footer, adaptCard: true });
}

export function reasonSentence(reason: string) {
  const text = reason.trim();
  if (/^(you|this)\b/i.test(text) && /[.!]$/.test(text)) return text;
  return `You're receiving this because ${text.replace(/[.!]+$/, "")}.`;
}

// ─── A store → its customers (B) ─────────────────────────────────────────────────

export interface StoreSender {
  /** Shown in the header and "from" lines. */
  name: string;
  /** Business (legal) name for the footer, defaults to the store name. */
  legalName?: string | null;
  logoUrl?: string | null;
  /** Full postal address, or null when the seller hasn't added one. */
  address?: string | null;
  websiteUrl?: string | null;
  contactUrl?: string | null;
  privacyUrl?: string | null;
  /** Buttons. */
  accent?: string | null;
  /** Hide the "Sent with Shopinbos" mark (paid plans; nothing sets it yet). */
  hidePoweredBy?: boolean;
}

export interface StoreEmailInput {
  appUrl: string;
  store: StoreSender;
  kind: EmailKind;
  title?: string;
  preheader?: string | null;
  eyebrow?: string | null;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string } | null;
  reason?: string | null;
  unsubscribeUrl?: string | null;
  preferencesUrl?: string | null;
  serviceNote?: string | null;
}

export function storeFooter(input: { appUrl: string; store: StoreSender; kind: EmailKind; reason?: string | null; unsubscribeUrl?: string | null; preferencesUrl?: string | null; serviceNote?: string | null; tone?: "light" | "dark" }) {
  const name = input.store.name;
  return footerHtml({
    kind: input.kind,
    senderName: input.store.legalName?.trim() || name,
    address: input.store.address,
    reason: reasonSentence(input.reason ?? (needsUnsubscribe(input.kind) ? `you subscribed to emails from ${name} or bought from them` : `you placed an order with ${name}`)),
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesUrl: input.preferencesUrl,
    serviceNote: input.serviceNote ?? (input.kind === "transactional" ? `This is a service message about your order with ${name}.` : null),
    contactUrl: input.store.contactUrl ?? input.store.websiteUrl,
    contactLabel: `Contact ${name}`,
    privacyUrl: input.store.privacyUrl,
    poweredBy: input.store.hidePoweredBy ? null : { appUrl: input.appUrl },
    tone: input.tone,
  });
}

export function storeEmail(input: StoreEmailInput) {
  const appUrl = cleanAppUrl(input.appUrl);
  const accent = hex(input.store.accent, EMAIL_COLORS.navy);
  const body = `${input.eyebrow ? html.eyebrow(input.eyebrow) : ""}${html.h1(input.heading)}${input.bodyHtml}${input.cta ? html.button(input.cta.label, input.cta.url, { bg: accent, fg: readableOn(accent), brand: true }) : ""}`;
  const footer = storeFooter({ appUrl, store: input.store, kind: input.kind, reason: input.reason, unsubscribeUrl: input.unsubscribeUrl, preferencesUrl: input.preferencesUrl, serviceNote: input.serviceNote });
  return emailDocument({
    title: input.title ?? input.heading,
    preheader: input.preheader,
    header: storeHeader({ name: input.store.name, logoUrl: input.store.logoUrl, href: input.store.websiteUrl }),
    card: body,
    footer,
    adaptCard: true,
  });
}

/** Navy or white text, whichever reads better on the colour. */
export function readableOn(color: string) {
  const value = hex(color, "#000000").slice(1);
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? EMAIL_COLORS.navy : "#FFFFFF";
}

// ─── Headers ──────────────────────────────────────────────────────────────────

/** RFC 8058 one-click unsubscribe headers (Gmail and Yahoo require them from bulk senders). */
export function listUnsubscribeHeaders(oneClickUrl: string, mailto?: string | null): Record<string, string> {
  const parts = [`<${oneClickUrl}>`];
  if (mailto && /^mailto:/i.test(mailto)) parts.push(`<${mailto}>`);
  return { "List-Unsubscribe": parts.join(", "), "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/** The mailto half of List-Unsubscribe, when UNSUBSCRIBE_MAILTO (an inbox someone processes) is set. */
export function unsubscribeMailto(address: string | null | undefined, token: string) {
  const to = String(address ?? "").trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) return null;
  return `mailto:${to}?subject=${encodeURIComponent(`unsubscribe ${token}`)}`;
}

// ─── Business address (store) ──────────────────────────────────────────────────

export interface BusinessAddress {
  legalName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  email: string;
  phone: string;
}

export const EMPTY_BUSINESS_ADDRESS: BusinessAddress = { legalName: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "", email: "", phone: "" };

/** The store's business address from brandSettings.businessAddress (cleaned). */
export function readBusinessAddress(brandSettings: unknown): BusinessAddress {
  const settings = brandSettings && typeof brandSettings === "object" && !Array.isArray(brandSettings) ? (brandSettings as Record<string, unknown>) : {};
  const raw = settings.businessAddress && typeof settings.businessAddress === "object" ? (settings.businessAddress as Record<string, unknown>) : {};
  const out = { ...EMPTY_BUSINESS_ADDRESS };
  for (const key of Object.keys(out) as Array<keyof BusinessAddress>) out[key] = typeof raw[key] === "string" ? String(raw[key]).trim().slice(0, 160) : "";
  return out;
}

/** A postal address good enough for a marketing footer: street, city and country. */
export function hasPostalAddress(address: BusinessAddress) {
  return Boolean(address.line1 && address.city && address.country);
}

export function formatPostalAddress(address: BusinessAddress) {
  if (!hasPostalAddress(address)) return null;
  const cityLine = [address.city, address.state].filter(Boolean).join(", ");
  return [address.line1, address.line2, cityLine, [address.country, address.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export const MISSING_ADDRESS_MESSAGE =
  "Add your business address before sending marketing emails. Anti-spam laws (and Gmail and Yahoo) need a postal address in every marketing email's footer. Add it in Settings › Store › Business address (/home/settings?tab=Store#business-address).";
