import { readPreheader } from "./blocks.ts";
import { SAMPLE_VARIABLES, wrapEmail, type EmailBrand } from "./email-layout.ts";
import { fillVariables } from "./flows.ts";

// The email exactly as a recipient sees it, with a sample customer (Ada) and the shop's brand kit. Pure, so
// the builder renders its live preview and the template gallery its thumbnails without a round trip.

export interface PreviewShop {
  name: string;
  /** The storefront link that {{store_url}} becomes. */
  url: string;
}

export function sampleVariables(brand: EmailBrand, shop: PreviewShop) {
  return { ...SAMPLE_VARIABLES, store: shop.name, store_url: shop.url, cart_url: `${shop.url.replace(/\/$/, "")}/cart`, unsubscribe_url: "#", brand_accent: brand.accent };
}

export function renderEmailPreview({ bodyHtml, preheader, brand, shop }: { bodyHtml: string; preheader?: string | null; brand: EmailBrand; shop: PreviewShop }) {
  const vars = sampleVariables(brand, shop);
  const pre = preheader || readPreheader(bodyHtml);
  const html = wrapEmail({ bodyHtml: fillVariables(bodyHtml, vars, "html"), brand, preheader: pre ? fillVariables(pre, vars, "text") : null });
  // The builder's bookkeeping comments (blocks, preview line, style) are no use in a preview and can be large.
  return html.replace(/<!--sib-[a-z]+:[A-Za-z0-9+/=]*-->\n?/g, "");
}

/** A subject line with the sample customer filled in. */
export function previewSubject(subject: string, shop: PreviewShop) {
  return fillVariables(subject, { ...SAMPLE_VARIABLES, store: shop.name }, "text");
}
