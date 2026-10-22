"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { readCartSettings } from "@shared/cart-checkout";
import { storefrontPageHref } from "@shared/storefront-pages";
import { useStoreVisitBeacon } from "@/hooks/useStoreVisitor";
import { useStoreProductView } from "@/lib/analytics/storefront-events";
import { useCampaignAttribution } from "@/hooks/useCampaignAttribution";
import type { StoreSellerCard, StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { CartDrawer } from "../../CartDrawer";
import { ShopperBottomNav } from "@/components/storefront/shopper/ShopperBottomNav";
import { StoreFootnote } from "@/components/storefront/shopper/StoreFooterBadges";
import type { ShopperProduct } from "@/components/storefront/shopper/catalog";
import type { AddToBagInput, BoutiqueProductDetail, ProductReviewEntry } from "@/components/storefront/boutique/BoutiqueProductView";
import type { BoutiqueLook } from "@/components/storefront/boutique/look";
import { ClassicPdp } from "@/components/storefront/boutique/pdp/ClassicPdp";
import { StoreLogo } from "@/components/storefront/StoreLogo";
import type { PdpSettings } from "@/components/storefront/boutique/pdp/pdp-logic";

interface ProductDetailClientProps {
  store: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    logoUrl?: string | null;
    city?: string | null;
    country?: string | null;
    currency: string;
    brandSettings: Record<string, unknown>;
  };
  product: BoutiqueProductDetail;
  reviews: ProductReviewEntry[];
  avgRating: number;
  reviewCount: number;
  storeBasePath: string;
  /** The store's published products, for the phone bottom nav's search and wishlist, and "Recently viewed". */
  catalog?: ShopperProduct[];
  /** "Customers also like" (the seller's picks, else similar products). */
  related?: ShopperProduct[];
  shopper: StorefrontShopperInfo;
  /** The seller card (name, where they are and deliver, WhatsApp). */
  seller?: StoreSellerCard | null;
  /** Product page settings from the store's published snapshot (classicPdpSettingsForSnapshot). */
  settings: PdpSettings;
  /** The classic theme's colours, fonts and shape (classicLook). */
  look: BoutiqueLook;
  /** The store sells with a single "Buy now" button (cart settings): the main button goes straight to checkout. */
  buyNowOnly?: boolean;
}

/** The live product page for classic (pre-2026) template stores: the shared product page in the classic theme's look. */
export function ProductDetailClient({
  store, product, reviews, avgRating, reviewCount, storeBasePath, catalog = [], related = [], shopper, seller = null, settings, look, buyNowOnly = false,
}: ProductDetailClientProps) {
  const [cartOpen, setCartOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | undefined>(undefined);
  const router = useRouter();
  const cart = useCart(store.slug);
  useCampaignAttribution(store.slug);
  useStoreVisitBeacon(store.slug);
  useStoreProductView(store.slug, product.id, { id: product.id, name: product.name, price: product.retailPrice, currency: store.currency });
  const wishlist = useWishlist(store.slug);
  const cartSettings = readCartSettings(store.brandSettings);
  const t = look.tokens;
  const home = getPublicStorefrontPath(storeBasePath, "/");

  useEffect(() => {
    setShareUrl(window.location.href.split("#")[0]);
  }, []);

  function addLine(input: AddToBagInput) {
    cart.add({ productId: product.id, name: input.name, price: input.price, image: input.image, variant: input.variant, variantId: input.variantId, maxQuantity: input.maxQuantity, quantity: input.quantity });
  }

  // Buy now checks out this product on its own, as classic stores always have.
  function buyNow(input: AddToBagInput) {
    cart.clear();
    addLine(input);
    router.push(getPublicStorefrontPath(storeBasePath, "/checkout"));
  }

  function add(input: AddToBagInput) {
    if (buyNowOnly) return buyNow(input);
    addLine(input);
    if (cartSettings.afterAdd === "drawer") setCartOpen(true);
    else router.push(getPublicStorefrontPath(storeBasePath, cartSettings.afterAdd === "checkout" ? "/checkout" : "/cart"));
  }

  return (
    <div style={{ background: t.paperBg, minHeight: "100vh", color: t.ink, fontFamily: look.bodyFont }}>
      <nav aria-label="Store" style={{ borderBottom: `1px solid ${t.border}`, background: t.cardBg, position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", gap: 12 }}>
          <Link href={home} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <StoreLogo store={store} background={t.cardBg} style={{ width: 26, height: 26, borderRadius: 6 }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: t.ink, fontFamily: look.headingFont }}>{store.name}</span>
          </Link>
        </div>
      </nav>

      <ClassicPdp
        product={product}
        look={look}
        settings={buyNowOnly ? { ...settings, labels: { ...settings.labels, addToBag: settings.labels.buyNow } } : settings}
        shopper={shopper}
        seller={seller}
        storeName={store.name}
        reviewSlug={store.slug}
        currency={store.currency}
        reviews={reviews}
        avgRating={avgRating}
        reviewCount={reviewCount}
        related={related}
        relatedHref={(id) => getPublicStorefrontPath(storeBasePath, `/product/${id}`)}
        catalog={catalog}
        wishlistIds={cartSettings.wishlist ? wishlist.productIds : []}
        onToggleWishlist={cartSettings.wishlist ? wishlist.toggle : undefined}
        onAddToBag={add}
        onBuyNow={buyNowOnly ? undefined : buyNow}
        shareUrl={shareUrl}
        interactive
        crumbs={[
          { label: "Home", onSelect: () => router.push(home) },
          { label: "Shop", onSelect: () => router.push(storefrontPageHref(storeBasePath, "products") ?? home) },
          ...(product.category ? [{ label: product.category.name, onSelect: () => router.push(storefrontPageHref(storeBasePath, "products", new URLSearchParams({ category: product.category!.slug })) ?? home) }] : []),
          { label: product.name },
        ]}
      />

      <div style={{ maxWidth: 1320, margin: "0 auto", padding: "8px 24px 110px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "center" }}>
          <a href={getPublicStorefrontPath(storeBasePath, "/reviews")} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontSize: 14, color: t.ink }}>All shop reviews</a>
          <Link
            href={home}
            style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 28px", borderRadius: look.buttonRadius, ...look.solidButton, fontWeight: 700, fontSize: 14, textDecoration: "none" }}
          >
            Continue shopping
          </Link>
        </div>
        <StoreFootnote muted={t.muted} border={t.border} ink={t.ink} className="mt-12" />
      </div>

      <ShopperBottomNav
        storeSlug={store.slug}
        storeName={store.name}
        basePath={storeBasePath}
        products={catalog.some((entry) => entry.id === product.id) ? catalog : [product, ...catalog]}
        wishlistIds={cartSettings.wishlist ? wishlist.productIds : []}
        onToggleWishlist={cartSettings.wishlist ? wishlist.toggle : undefined}
        cartCount={cart.count}
        onOpenBag={() => setCartOpen(true)}
        colors={{ active: t.ink, activeText: t.paperBg, badge: t.accent }}
      />
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        storeBasePath={storeBasePath}
        currency={store.currency}
        accentColor={t.ctaBg}
        accentTextColor={t.ctaText}
      />
    </div>
  );
}
