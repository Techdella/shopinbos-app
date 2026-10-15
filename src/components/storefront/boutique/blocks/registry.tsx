"use client";

// The one place the ready-made store blocks are registered: kind → { label, description, category, icon, defaults,
// schema, render }. Metadata, starter content and inspector fields come from block-catalog.ts (pure, shared with
// the builder); the renderer for each kind is listed here. BoutiqueStorefront only calls isStoreBlock/StoreBlock.

import type React from "react";
import { STORE_BLOCKS, isStoreBlock, type StoreBlockMeta } from "./block-catalog";
import { CollectionGrid } from "./CollectionGrid";
import { CompareTable } from "./CompareTable";
import { FounderStory } from "./FounderStory";
import { ParallaxBanner } from "./ParallaxBanner";
import { PressLogos } from "./PressLogos";
import { ProductCarousel } from "./ProductCarousel";
import { PromoPopup } from "./PromoPopup";
import { AlsoLike, RecentlyViewed } from "./RecentlyViewed";
import { ReviewCarousel } from "./ReviewCarousel";
import { SalesPop } from "./SalesPop";
import { ShippingProgress } from "./ShippingProgress";
import { ShopTheLook } from "./ShopTheLook";
import { ShoppableStory } from "./ShoppableStory";
import { SizeFinder } from "./SizeFinder";
import { SplitHero } from "./SplitHero";
import { TabbedProducts } from "./TabbedProducts";
import { TickerBar } from "./TickerBar";
import { TrustBadges } from "./TrustBadges";
import { UgcGrid } from "./UgcGrid";
import { VideoHero } from "./VideoHero";
import type { BlockContext, BlockRenderer } from "./shared";

export { isStoreBlock } from "./block-catalog";
export type { BlockContext } from "./shared";

/** Every kind in block-catalog.ts must have a renderer here (tests/storefront-blocks.test.mjs checks). */
export const BLOCK_RENDERERS: Record<string, BlockRenderer> = {
  "split-hero": SplitHero,
  "parallax-banner": ParallaxBanner,
  "ticker-bar": TickerBar,
  "video-hero": VideoHero,
  "collection-grid": CollectionGrid,
  "product-carousel": ProductCarousel,
  "tabbed-products": TabbedProducts,
  "shop-the-look": ShopTheLook,
  "compare-table": CompareTable,
  "trust-badges": TrustBadges,
  "press-logos": PressLogos,
  "review-carousel": ReviewCarousel,
  "ugc-grid": UgcGrid,
  "sales-pop": SalesPop,
  "founder-story": FounderStory,
  "shoppable-story": ShoppableStory,
  "recently-viewed": RecentlyViewed,
  "also-like": AlsoLike,
  "shipping-progress": ShippingProgress,
  "promo-popup": PromoPopup,
  "size-finder": SizeFinder,
};

export type StoreBlockDefinition = StoreBlockMeta & { render: BlockRenderer };

/** The full registry: catalog metadata joined with each renderer. */
export const BLOCK_REGISTRY: Record<string, StoreBlockDefinition> = Object.fromEntries(
  STORE_BLOCKS.filter((meta) => BLOCK_RENDERERS[meta.kind]).map((meta) => [meta.kind, { ...meta, render: BLOCK_RENDERERS[meta.kind]! }]),
);

/** Draws one block section. Unknown kinds draw nothing (BoutiqueStorefront checks isStoreBlock first). */
export function StoreBlock({ ctx }: { ctx: BlockContext }): React.ReactNode {
  if (!isStoreBlock(ctx.section.kind)) return null;
  const Render = BLOCK_REGISTRY[ctx.section.kind]?.render;
  return Render ? <Render ctx={ctx} /> : null;
}
