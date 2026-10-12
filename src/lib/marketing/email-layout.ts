// Branded email shell and the starter template library. Pure (no server imports), unit-tested.
// Templates are stored as body HTML with {{variables}}; wrapEmail puts the shop's logo and brand colours
// around them at send time and in previews, so a brand kit change shows up in every email.

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

/** Full HTML document: brand header (logo or name), the body in a white card, brand colours on links. */
export function wrapEmail({ bodyHtml, brand, preheader }: { bodyHtml: string; brand: EmailBrand; preheader?: string | null }) {
  const accent = color(brand.accent, DEFAULT_BRAND.accent);
  const ink = color(brand.ink, DEFAULT_BRAND.ink);
  const paper = color(brand.paper, DEFAULT_BRAND.paper);
  const logo = brand.logoUrl && /^https:\/\//i.test(brand.logoUrl)
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.storeName)}" height="44" style="display:block;height:44px;max-width:200px;object-fit:contain;border:0" />`
    : `<span style="font-size:20px;font-weight:800;color:${ink}">${esc(brand.storeName)}</span>`;
  // A full document already (pasted HTML): only add the brand colour, leave its layout alone.
  if (/<html[\s>]/i.test(bodyHtml)) return bodyHtml.replace(/{{\s*brand_accent\s*}}/g, accent);
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${esc(brand.storeName)}</title></head>
<body style="margin:0;padding:0;background:${paper}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 8px 18px">${logo}</td></tr>
<tr><td style="background:#ffffff;border-radius:18px;padding:30px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${ink}">
${bodyHtml.replace(/{{\s*brand_accent\s*}}/g, accent)}
</td></tr>
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
