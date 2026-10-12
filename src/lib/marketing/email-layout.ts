// The marketing email wrapper and the starter template library. Pure (no server imports), unit-tested.
// Templates are stored as body HTML with {{variables}}; wrapEmail puts the shop's logo, brand colours and the
// compliance footer around them at send time and in previews (on the shared shell, src/lib/email/shell.ts), so a
// brand kit or business address change shows up in every email.

import { BLEED_MARK, readTheme, themePalette } from "./blocks.ts";
import { emailDocument, storeFooter, storeHeader, type EmailKind, type StoreSender } from "../email/shell.ts";

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
  // A full document already (pasted HTML): only add the brand colour and the footer, leave its layout alone.
  if (/<html[\s>]/i.test(bodyHtml)) {
    const filled = bodyHtml.replace(/{{\s*brand_accent\s*}}/g, accent);
    if (!footer) return filled;
    return /<\/body>/i.test(filled) ? filled.replace(/<\/body>/i, `${footer}</body>`) : filled + footer;
  }
  const logo = storeHeader({
    name: brand.storeName,
    logoUrl: brand.logoUrl,
    ink,
    font: theme.body,
    align: theme.logoAlign,
    nameStyle: theme.head.includes("font-family") ? theme.head.replace(/;text-transform:uppercase/, "") : "",
  });
  const body = bodyHtml.replace(/{{\s*brand_accent\s*}}/g, accent);
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
