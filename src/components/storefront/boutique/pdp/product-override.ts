// One product's own page settings, chosen on its product form (Product page tab), over the store's product page
// settings. Merge order: theme defaults → store settings (readPdpSettings) → this product's override.
//
// Stored in StoreProduct.pageLayout as { override: true, layout?, buyBox?, sections?, faqStyle? }. Only JSON carrying the
// `override: true` marker counts: older forms saved defaults the seller never chose (pageLayout {}, pageVariant
// "shopify", enabledModules ["image_gallery", "price", …] without the wishlist, related products…), and those must
// not hide parts of the page. A key left out means "use the store's setting" for that part.
// Pure (relative .ts imports only), so the behaviour tests load it directly.

import {
  DEFAULT_BUY_BLOCKS,
  DEFAULT_PAGE_BLOCKS,
  PDP_BUY_BLOCKS,
  PDP_LAYOUT_OPTIONS,
  PDP_PAGE_BLOCKS,
  readOrder,
  toggleInOrder,
  type PdpBuyBlock,
  type PdpLayout,
  type PdpPageBlock,
  type PdpSettings,
} from "./pdp-logic.ts";
import { readFaqStyle, type FaqStyle } from "../faq/faq-logic.ts";

export interface ProductPageOverride {
  /** null: the store's layout. */
  layout: PdpLayout | null;
  /** Buying panel parts shown for this product; null: the store's. */
  buyBox: PdpBuyBlock[] | null;
  /** Blocks under this product; null: the store's. */
  sections: PdpPageBlock[] | null;
  /** This product's question style; left out: the store's product page setting. */
  faqStyle?: FaqStyle;
}

export const NO_OVERRIDE: ProductPageOverride = { layout: null, buyBox: null, sections: null };

const LAYOUTS = PDP_LAYOUT_OPTIONS.map((option) => option.value);
const BUY_IDS = PDP_BUY_BLOCKS.map((option) => option.value);
const PAGE_IDS = PDP_PAGE_BLOCKS.map((option) => option.value);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The product's override from StoreProduct.pageLayout; legacy values (no `override: true`) override nothing. */
export function readProductPageOverride(pageLayout: unknown): ProductPageOverride {
  const value = record(pageLayout);
  if (value.override !== true) return NO_OVERRIDE;
  const layout = typeof value.layout === "string" && (LAYOUTS as string[]).includes(value.layout) ? (value.layout as PdpLayout) : null;
  const faqStyle = readFaqStyle(value.faqStyle);
  return {
    layout,
    buyBox: Array.isArray(value.buyBox) ? readOrder(value.buyBox, BUY_IDS, []) : null,
    sections: Array.isArray(value.sections) ? readOrder(value.sections, PAGE_IDS, []) : null,
    ...(faqStyle ? { faqStyle } : {}),
  };
}

export function hasProductPageOverride(override: ProductPageOverride) {
  return override.layout !== null || override.buyBox !== null || override.sections !== null || Boolean(override.faqStyle);
}

/** What the product form saves: the marker plus only the parts the seller chose. */
export function writeProductPageOverride(override: ProductPageOverride): Record<string, unknown> {
  return {
    override: true,
    ...(override.layout ? { layout: override.layout } : {}),
    ...(override.buyBox ? { buyBox: override.buyBox } : {}),
    ...(override.sections ? { sections: override.sections } : {}),
    ...(override.faqStyle ? { faqStyle: override.faqStyle } : {}),
  };
}

/**
 * The store's list with this product's choice of what shows: the store's order is kept, parts the product hides go,
 * parts the product shows that the store hides come back near their default place.
 */
function chooseShown<T extends string>(storeList: readonly T[], shown: readonly T[], defaults: readonly T[]): T[] {
  let list = storeList.filter((id) => shown.includes(id));
  for (const id of shown) if (!list.includes(id)) list = toggleInOrder(list, id, true, defaults);
  return list;
}

/** The settings this product's page renders with: the store's, with the product's own choices on top. */
export function applyProductPageOverride(settings: PdpSettings, override: ProductPageOverride): PdpSettings {
  if (!hasProductPageOverride(override)) return settings;
  return {
    ...settings,
    layout: override.layout ?? settings.layout,
    buyBox: override.buyBox ? chooseShown(settings.buyBox, override.buyBox, DEFAULT_BUY_BLOCKS) : settings.buyBox,
    sections: override.sections ? chooseShown(settings.sections, override.sections, DEFAULT_PAGE_BLOCKS) : settings.sections,
    faq: override.faqStyle ? { ...settings.faq, style: override.faqStyle } : settings.faq,
  };
}
