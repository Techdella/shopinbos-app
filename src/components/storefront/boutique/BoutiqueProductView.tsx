"use client";

import type { StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import type { ShopperProduct } from "../shopper/catalog";
import type { BoutiqueLook } from "./look";
import { BoutiquePdp } from "./pdp/BoutiquePdp";
import { readPdpSettings, type PdpSettings } from "./pdp/pdp-logic";

export interface ProductReviewEntry {
  id: string;
  buyerName: string;
  rating: number;
  title: string;
  body: string;
  sellerReply: string;
  createdAt: string;
  images?: string[];
}

export interface BoutiqueProductDetail extends ShopperProduct {
  sku?: string | null;
  longDescription?: string | null;
  specifications?: unknown;
  careInstructions?: string | null;
  shippingInfo?: string | null;
  returnPolicy?: string | null;
  warranty?: string | null;
  supportInfo?: string | null;
  faqs?: unknown;
  videoUrl?: string | null;
  tags?: string[];
  currentStock?: number | null;
  lowStockThreshold?: number | null;
  productDetails?: unknown;
}

export interface AddToBagInput {
  name: string;
  price: number;
  image?: string;
  variant?: string;
  variantId?: string;
  quantity: number;
  maxQuantity?: number;
}

export interface BoutiqueProductViewProps {
  product: BoutiqueProductDetail;
  look: BoutiqueLook;
  shopper: StorefrontShopperInfo;
  storeName: string;
  currency: string;
  reviews: ProductReviewEntry[];
  avgRating: number;
  reviewCount: number;
  related: ShopperProduct[];
  relatedHref?: (productId: string) => string;
  onOpenRelated?: (productId: string) => void;
  wishlistIds: string[];
  onToggleWishlist?: (productId: string) => void;
  onAddToBag?: (input: AddToBagInput) => void;
  onBuyNow?: (input: AddToBagInput) => void;
  /** Breadcrumb trail; the last entry is the product. */
  crumbs: Array<{ label: string; onSelect?: () => void }>;
  /** Absolute page URL for Share and the WhatsApp message (live only). */
  shareUrl?: string;
  interactive: boolean;
  /** Store slug for the live "Write a review" form (left out in editor previews). */
  reviewSlug?: string;
  /** Product page settings from the store's editor snapshot; the theme's defaults when left out. */
  settings?: PdpSettings;
  /** The store's products, for "Recently viewed" (falls back to the related list). */
  catalog?: ShopperProduct[];
  /** Builder-only note above the page (e.g. "Sample product"). */
  notice?: string;
}

/** The 2026 themes' product page (live route and builder preview). Layout and blocks come from `settings`. */
export function BoutiqueProductView(props: BoutiqueProductViewProps) {
  const settings = props.settings ?? readPdpSettings(null, props.look.id);
  return <BoutiquePdp key={props.product.id} {...props} settings={settings} />;
}
