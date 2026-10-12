// Branded email shell and the starter template library. Pure (no server imports), unit-tested.
// Templates are stored as body HTML with {{variables}}; wrapEmail puts the shop's logo and brand colours
// around them at send time and in previews, so a brand kit change shows up in every email.

import { BLEED_MARK, readTheme, themePalette } from "./blocks.ts";

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

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: string) => value.replace(/[&<>"']/g, (ch) => ESC[ch]);
const color = (value: string, fallback: string) => (/^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : fallback);

/**
 * Full HTML document: brand header (logo or name), the body in a card, brand colours on links. A body written
 * with a style family (see blocks.ts themes) gets that family's card, page and fonts; a full-bleed hero at the
 * top runs edge to edge in its own row, above the padded part of the card.
 */
export function wrapEmail({ bodyHtml, brand, preheader }: { bodyHtml: string; brand: EmailBrand; preheader?: string | null }) {
  const accent = color(brand.accent, DEFAULT_BRAND.accent);
  const theme = themePalette(readTheme(bodyHtml));
  const ink = theme.ink ?? color(brand.ink, DEFAULT_BRAND.ink);
  const paper = theme.page ?? color(brand.paper, DEFAULT_BRAND.paper);
  const logo = brand.logoUrl && /^https:\/\//i.test(brand.logoUrl)
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.storeName)}" height="44" style="display:${theme.logoAlign === "center" ? "inline-block" : "block"};height:44px;max-width:200px;object-fit:contain;border:0" />`
    : `<span style="font-family:${theme.body};font-size:20px;font-weight:800;color:${ink}${theme.head.includes("font-family") ? theme.head.replace(/;text-transform:uppercase/, "") : ""}">${esc(brand.storeName)}</span>`;
  // A full document already (pasted HTML): only add the brand colour, leave its layout alone.
  if (/<html[\s>]/i.test(bodyHtml)) return bodyHtml.replace(/{{\s*brand_accent\s*}}/g, accent);
  const body = bodyHtml.replace(/{{\s*brand_accent\s*}}/g, accent);
  const cell = `background:${theme.card};font-family:${theme.body};font-size:16px;line-height:1.6;color:${ink}`;
  const radius = theme.radius + 4;
  const split = body.indexOf(BLEED_MARK);
  const card =
    split >= 0
      ? `<tr><td bgcolor="${theme.card}" style="${cell};padding:0;border-radius:${radius}px ${radius}px 0 0;overflow:hidden">
${body.slice(0, split)}
</td></tr>
<tr><td bgcolor="${theme.card}" style="${cell};padding:6px 28px 30px;border-radius:0 0 ${radius}px ${radius}px">
${body.slice(split + BLEED_MARK.length)}
</td></tr>`
      : `<tr><td bgcolor="${theme.card}" style="${cell};border-radius:${radius}px;padding:30px 28px">
${body}
</td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />${theme.dark ? '<meta name="color-scheme" content="dark" /><meta name="supported-color-schemes" content="dark" />' : ""}<title>${esc(brand.storeName)}</title><style>@media only screen and (max-width:480px){.sib-col{max-width:100%!important}}</style></head>
<body style="margin:0;padding:0;background:${paper}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 8px 18px${theme.logoAlign === "center" ? ";text-align:center" : ""}">${logo}</td></tr>
${card}
</table></td></tr></table>
<style>a{color:${accent}}</style>
</body></html>`;
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
