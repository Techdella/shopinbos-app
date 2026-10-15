// Inspector fields for the 2026 themes' product page (the product page's "product-detail" section). Every field is
// read by readPdpSettings (src/components/storefront/boutique/pdp/pdp-logic.ts), which the builder preview and the
// live product route both render with. Pure data: loaded by tests without a bundler.

import {
  DEFAULT_BUY_BLOCKS,
  DEFAULT_PAGE_BLOCKS,
  PDP_BUY_BLOCKS,
  PDP_GALLERY_OPTIONS,
  PDP_LAYOUT_OPTIONS,
  PDP_PAGE_BLOCKS,
  pdpThemeDefaults,
} from "../../storefront/boutique/pdp/pdp-logic.ts";
import { CLASSIC_DEFAULT_PRODUCT_LAYOUT, CLASSIC_PDP_DEFAULTS, CLASSIC_PRODUCT_LAYOUTS } from "../../storefront/boutique/pdp/classic-pdp.ts";
import type { FieldGroup, SchemaField, When } from "./section-schema";

const copy = (key: string) => ({ scope: "copy" as const, key });
const setting = (key: string) => ({ scope: "settings" as const, key });

/** `defaults`: the layout, photos and details style shown until the seller picks one (else the theme's own). */
export function pdpSchemaGroups(themeId: string, defaults?: { layout: string; gallery: string; details: string }): FieldGroup[] {
  const theme = defaults ?? pdpThemeDefaults(themeId);
  return [
    { fields: [
      { id: "note", type: "note", label: "These settings apply to every product page. Photos, prices, sizes and details come from each product." },
      { id: "pdpLayout", type: "cards", label: "Layout", target: setting("pdpLayout"), fallback: theme.layout, options: PDP_LAYOUT_OPTIONS },
      { id: "galleryStyle", type: "segmented", label: "Photos", target: setting("galleryStyle"), fallback: theme.gallery, options: PDP_GALLERY_OPTIONS.map((option) => ({ value: option.value, label: option.label.replace("Thumbnails ", "Thumbs ") })) },
      { id: "zoom", type: "toggle", label: "Zoom and full-screen photos", target: setting("zoom"), fallback: true },
      { id: "detailsStyle", type: "segmented", label: "Product details", target: setting("detailsStyle"), fallback: theme.details, options: [{ value: "accordion", label: "Accordion" }, { value: "tabs", label: "Tabs" }] },
      { id: "stickyBar", type: "toggle", label: "Sticky Add to bag bar on phones", target: setting("stickyBar"), fallback: true },
      { id: "breadcrumbs", type: "toggle", label: "Breadcrumbs", target: setting("breadcrumbs"), fallback: true },
    ] },
    { title: "Buying panel", fields: [
      { id: "buyBox", type: "order", label: "Shows, in this order", target: setting("buyBox"), options: PDP_BUY_BLOCKS, fallback: DEFAULT_BUY_BLOCKS, help: "The product name is always at the top. Parts with nothing to show (no reviews, no sizes) stay hidden." },
    ] },
    { title: "Below the product", fields: [
      { id: "pageBlocks", type: "order", label: "Shows, in this order", target: setting("pageBlocks"), options: PDP_PAGE_BLOCKS, fallback: DEFAULT_PAGE_BLOCKS },
    ] },
    { title: "Buttons and headings", fields: [
      { id: "addToBagLabel", type: "text", label: "Add to bag button", target: copy("addToBagLabel"), placeholder: "Add to bag" },
      { id: "buyNowLabel", type: "text", label: "Buy now button", target: copy("buyNowLabel"), placeholder: "Buy now" },
      { id: "reviewsTitle", type: "text", label: "Reviews heading", target: copy("reviewsTitle"), placeholder: "Customer reviews" },
      { id: "relatedTitle", type: "text", label: "Related products heading", target: copy("relatedTitle"), placeholder: "Customers also like" },
      { id: "recentTitle", type: "text", label: "Recently viewed heading", target: copy("recentTitle"), placeholder: "Recently viewed" },
    ] },
    { title: "Trust badges", fields: [
      { id: "trustDelivery", type: "toggle", label: "Delivery", target: setting("trustDelivery"), fallback: true },
      { id: "trustDeliveryText", type: "text", label: "Delivery text", target: copy("trustDeliveryText"), placeholder: "From your delivery settings", help: "Leave empty to use your delivery zones and free-delivery offer." },
      { id: "trustPayOnDelivery", type: "toggle", label: "Pay on delivery", target: setting("trustPayOnDelivery"), fallback: true, help: "Only shows when pay on delivery is on in Checkout settings." },
      { id: "trustPodText", type: "text", label: "Pay on delivery text", target: copy("trustPodText"), placeholder: "Pay on delivery" },
      { id: "trustReturns", type: "toggle", label: "Returns", target: setting("trustReturns"), fallback: true, help: "Shows when you add text below or the product has a return policy." },
      { id: "trustReturnsText", type: "text", label: "Returns text", target: copy("trustReturnsText"), placeholder: "e.g. 7-day returns" },
      { id: "trustCustomText", type: "text", label: "Your own badge", target: copy("trustCustomText"), placeholder: "e.g. 100% original", help: "Only promise what you really offer." },
    ] },
  ];
}

/**
 * The same fields for classic templates (readClassicPdpSettings in classic-pdp.ts). Their starting layout, photos and
 * details style follow the section's saved classic `layout`, so a field whose default differs between classic layouts
 * is listed once per default and only shows (`when`) for the classic layouts that start from it.
 */
export function classicPdpSchemaGroups(): FieldGroup[] {
  const variants = CLASSIC_PRODUCT_LAYOUTS.map((layout) => ({ layout, groups: pdpSchemaGroups("", CLASSIC_PDP_DEFAULTS[layout]) }));
  return variants[0]!.groups.map((group, g) => ({
    ...group,
    fields: group.fields.flatMap((field, f): SchemaField[] => {
      const byFallback = new Map<string, { field: SchemaField; layouts: string[] }>();
      for (const variant of variants) {
        const own = variant.groups[g]!.fields[f]!;
        const key = JSON.stringify((own as { fallback?: unknown }).fallback ?? null);
        const entry = byFallback.get(key) ?? { field: own, layouts: [] };
        entry.layouts.push(variant.layout);
        byFallback.set(key, entry);
      }
      if (byFallback.size === 1) return [field];
      return [...byFallback.values()].map(({ field: own, layouts }) => {
        // The copy for the default classic layout also covers sections saved with no (or an unknown) layout.
        const when: When = layouts.includes(CLASSIC_DEFAULT_PRODUCT_LAYOUT)
          ? { scope: "settings", key: "layout", notIn: CLASSIC_PRODUCT_LAYOUTS.filter((layout) => !layouts.includes(layout)), fallback: CLASSIC_DEFAULT_PRODUCT_LAYOUT }
          : { scope: "settings", key: "layout", in: layouts, fallback: CLASSIC_DEFAULT_PRODUCT_LAYOUT };
        return { ...own, when };
      });
    }),
  }));
}
