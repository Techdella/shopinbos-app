"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CartDrawer } from "@/app/s/[slug]/CartDrawer";
import { rewardTiersFor } from "@/lib/gamification/logic";
import { useCampaignAttribution } from "@/hooks/useCampaignAttribution";
import { useCart } from "@/hooks/useCart";
import { readCartSettings } from "@shared/cart-checkout";
import { useStoreVisitBeacon } from "@/hooks/useStoreVisitor";
import { useStoreProductView } from "@/lib/analytics/storefront-events";
import { useWishlist } from "@/hooks/useWishlist";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import type { BoutiqueThemeId, StoreEditorSnapshot, TemplateSectionNode } from "@/lib/store-templates";
import { freeDeliveryEverywhereOver, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { relatedProducts, type ShopperProduct } from "../shopper/catalog";
import { ShopperBottomNav, type ShopperSheet } from "../shopper/ShopperBottomNav";
import { AnnouncementBar, BoutiqueFooter, BoutiqueHeader, type ChromeLink } from "./BoutiqueChrome";
import { legalLinks, legalPagePath } from "@/lib/legal/pages";
import { BoutiqueProductView, type AddToBagInput, type BoutiqueProductDetail, type ProductReviewEntry } from "./BoutiqueProductView";
import { BOUTIQUE_FONT_CLASS } from "./fonts";
import { BOUTIQUE_CSS, boutiqueLook, lookVars, navColors, pdpLayout } from "./look";

interface Props {
  themeId: BoutiqueThemeId;
  snapshot: StoreEditorSnapshot;
  store: { id: string; name: string; slug: string; logoUrl?: string | null; city?: string | null; country?: string | null; currency: string; brandSettings?: unknown };
  product: BoutiqueProductDetail;
  reviews: ProductReviewEntry[];
  avgRating: number;
  reviewCount: number;
  catalog: ShopperProduct[];
  shopper: StorefrontShopperInfo;
  storeBasePath: string;
}

const LABELS: Record<string, string> = { home: "Home", products: "Shop", about: "About", contact: "Contact", faq: "FAQ" };

function copyOf(section: TemplateSectionNode | undefined): Record<string, unknown> {
  return (section?.blocks.find((entry) => entry.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** The live product page for the 2026 theme stores. */
export function BoutiqueProductPage({ themeId, snapshot, store, product, reviews, avgRating, reviewCount, catalog, shopper, storeBasePath }: Props) {
  const router = useRouter();
  const cart = useCart(store.slug);
  const wishlist = useWishlist(store.slug);
  const cartSettings = readCartSettings(store.brandSettings);
  useCampaignAttribution(store.slug);
  useStoreVisitBeacon(store.slug);
  useStoreProductView(store.slug, product.id);
  const [cartOpen, setCartOpen] = useState(false);
  const [sheet, setSheet] = useState<ShopperSheet>(null);
  const [shareUrl, setShareUrl] = useState<string | undefined>(undefined);
  const look = useMemo(() => boutiqueLook(themeId, snapshot.themeTokens), [themeId, snapshot.themeTokens]);

  useEffect(() => {
    setShareUrl(window.location.href.split("#")[0]);
  }, []);

  const home = snapshot.pages.find((page) => page.pageType === "home") ?? snapshot.pages[0];
  const sections = (home?.sections ?? []).filter((section) => section.visible !== false);
  const headerSection = sections.find((section) => section.kind === "header");
  const headerCopy = copyOf(headerSection);
  const headerLayout = typeof headerSection?.settings?.layout === "string" ? headerSection.settings.layout : "";
  const announcementSection = sections.find((section) => section.kind === "announcement-bar");
  const announcement = announcementSection ? text(copyOf(announcementSection).text) || shopper.announcement : null;
  const footerSection = sections.find((section) => section.kind === "footer");
  const pageTypes = new Set(snapshot.pages.map((page) => page.pageType as string));

  const pageHref = (page: string) => getPublicStorefrontPath(storeBasePath, page === "home" ? "/" : `/?page=${page}`);
  const go = (page: string) => router.push(pageHref(page));
  const navKeys = (Array.isArray(headerCopy.navLinks) ? (headerCopy.navLinks as unknown[]) : ["home", "products", "about", "contact"])
    .map((entry) => (String(entry) === "shop" ? "products" : String(entry)))
    .filter((key, index, all) => LABELS[key] && (key === "home" || pageTypes.has(key)) && all.indexOf(key) === index);
  const links: ChromeLink[] = navKeys.map((key) => ({ key, label: LABELS[key]!, onSelect: () => go(key) }));
  const footerLinks: ChromeLink[] = ["products", "faq", "about", "contact"]
    .filter((key) => pageTypes.has(key))
    .map((key) => ({ key, label: key === "faq" ? "Delivery and FAQ" : LABELS[key]!, onSelect: () => go(key) }));
  const categories = useMemo(() => {
    const map = new Map<string, { slug: string; name: string }>();
    for (const entry of catalog) if (entry.category?.slug) map.set(entry.category.slug, { slug: entry.category.slug, name: entry.category.name });
    return [...map.values()];
  }, [catalog]);
  // "Customers also like": the seller's picks, else same type, category or tags.
  const related = useMemo(() => relatedProducts(product, catalog), [catalog, product]);

  function add(input: AddToBagInput) {
    cart.add({ productId: product.id, name: input.name, price: input.price, image: input.image, variant: input.variant, variantId: input.variantId, maxQuantity: input.maxQuantity, quantity: input.quantity });
    if (cartSettings.afterAdd === "drawer") setCartOpen(true);
    else router.push(getPublicStorefrontPath(storeBasePath, cartSettings.afterAdd === "checkout" ? "/checkout" : "/cart"));
  }

  function buyNow(input: AddToBagInput) {
    cart.add({ productId: product.id, name: input.name, price: input.price, image: input.image, variant: input.variant, variantId: input.variantId, maxQuantity: input.maxQuantity, quantity: input.quantity });
    router.push(getPublicStorefrontPath(storeBasePath, "/checkout"));
  }

  const logoText = text(headerCopy.logoText) && text(headerCopy.logoText) !== "Store" ? text(headerCopy.logoText) : store.name;
  const cartLabel = text(headerCopy.cartLabel) && text(headerCopy.cartLabel) !== "Cart" ? text(headerCopy.cartLabel) : "My bag";
  const searchable = catalog.some((entry) => entry.id === product.id) ? catalog : [product, ...catalog];

  return (
    <div className={`bq ${BOUTIQUE_FONT_CLASS}`} data-pdp={pdpLayout(look, snapshot)} style={{ ...lookVars(look), minHeight: "100vh" }}>
      <style>{BOUTIQUE_CSS}</style>
      <a href="#bq-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">Skip to product</a>
      <AnnouncementBar text={announcement} look={look} />
      <BoutiqueHeader
        store={store}
        logoText={logoText}
        look={look}
        links={links}
        categories={categories}
        onHome={() => go("home")}
        onShopAll={() => go("products")}
        onCategory={() => go("products")}
        onSearch={() => setSheet("search")}
        onWishlist={cartSettings.wishlist ? () => setSheet("wishlist") : undefined}
        onBag={() => setCartOpen(true)}
        cartCount={cart.count}
        wishlistCount={wishlist.productIds.length}
        cartLabel={cartLabel}
        centred={headerLayout === "centered" || (headerLayout !== "split" && headerLayout !== "bold" && look.centredHeader)}
      />
      <main id="bq-main" className="bq-page" tabIndex={-1}>
        <BoutiqueProductView
          product={product}
          look={look}
          shopper={shopper}
          storeName={store.name}
          reviewSlug={store.slug}
          currency={store.currency}
          reviews={reviews}
          avgRating={avgRating}
          reviewCount={reviewCount}
          related={related}
          relatedHref={(id) => getPublicStorefrontPath(storeBasePath, `/product/${id}`)}
          wishlistIds={cartSettings.wishlist ? wishlist.productIds : []}
          onToggleWishlist={cartSettings.wishlist ? wishlist.toggle : undefined}
          onAddToBag={add}
          onBuyNow={buyNow}
          crumbs={[
            { label: "Home", onSelect: () => go("home") },
            { label: "Shop", onSelect: () => go("products") },
            ...(product.category ? [{ label: product.category.name, onSelect: () => go("products") }] : []),
            { label: product.name },
          ]}
          shareUrl={shareUrl}
          interactive
        />
      </main>
      {footerSection ? <BoutiqueFooter store={store} look={look} shopper={shopper} links={footerLinks} summary={text(copyOf(footerSection).summary)} onTrackOrder={() => setSheet("account")} legalLinks={legalLinks(store.brandSettings).map((link) => ({ key: link.key, label: link.title, href: getPublicStorefrontPath(storeBasePath, legalPagePath(link.key)) }))} /> : null}
      <ShopperBottomNav
        storeSlug={store.slug}
        storeName={store.name}
        basePath={storeBasePath}
        products={searchable}
        wishlistIds={cartSettings.wishlist ? wishlist.productIds : []}
        onToggleWishlist={cartSettings.wishlist ? wishlist.toggle : undefined}
        cartCount={cart.count}
        onOpenBag={() => setCartOpen(true)}
        colors={navColors(look)}
        sheet={sheet}
        onSheetChange={setSheet}
      />
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        storeBasePath={storeBasePath}
        currency={store.currency}
        accentColor={snapshot.themeTokens.ctaBg}
        accentTextColor={snapshot.themeTokens.ctaText}
        freeDeliveryThreshold={freeDeliveryEverywhereOver(shopper.delivery) ?? undefined}
        rewardTiers={rewardTiersFor(store.brandSettings)}
      />
    </div>
  );
}
