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
import { storefrontPageHref } from "@shared/storefront-pages";
import type { BoutiqueThemeId, StoreEditorSnapshot, TemplateSectionNode } from "@/lib/store-templates";
import { freeDeliveryEverywhereOver, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import { relatedProducts, type ShopperProduct } from "../shopper/catalog";
import { ShopperBottomNav, type ShopperSheet } from "../shopper/ShopperBottomNav";
import { resolveMenu, type MenuContext } from "../StoreMenu";
import { menuStyleOf, mobileMenuStyleOf, readMenu } from "@/lib/storefront/menu";
import { readFooterMenu, readMobileMenu } from "@/lib/storefront/store-navigation";
import { AnnouncementBar, BoutiqueFooter, chromeLinksFromMenu, BoutiqueHeader, marketHeaderOf, type ChromeLink } from "./BoutiqueChrome";
import { legalLinks, legalPagePath } from "@/lib/legal/pages";
import { BoutiqueProductView, type AddToBagInput, type BoutiqueProductDetail, type ProductReviewEntry } from "./BoutiqueProductView";
import { BOUTIQUE_FONT_CLASS } from "./fonts";
import { shopperCopy } from "@shared/placeholder-copy";
import { pdpSettingsForSnapshot } from "./pdp/pdp-logic";
import { BOUTIQUE_CSS, boutiqueLook, lookVars, navColors, pdpLayout } from "./look";

interface Props {
  themeId: BoutiqueThemeId;
  snapshot: StoreEditorSnapshot;
  store: { id: string; name: string; slug: string; description?: string | null; logoUrl?: string | null; city?: string | null; country?: string | null; currency: string; brandSettings?: unknown };
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
  useStoreProductView(store.slug, product.id, { id: product.id, name: product.name, price: product.retailPrice, currency: store.currency });
  const [cartOpen, setCartOpen] = useState(false);
  const [sheet, setSheet] = useState<ShopperSheet>(null);
  const [shareUrl, setShareUrl] = useState<string | undefined>(undefined);
  const look = useMemo(() => boutiqueLook(themeId, snapshot.themeTokens), [themeId, snapshot.themeTokens]);
  const pdpSettings = useMemo(() => pdpSettingsForSnapshot(snapshot, themeId), [snapshot, themeId]);

  useEffect(() => {
    setShareUrl(window.location.href.split("#")[0]);
  }, []);

  const home = snapshot.pages.find((page) => page.pageType === "home") ?? snapshot.pages[0];
  const sections = (home?.sections ?? []).filter((section) => section.visible !== false);
  const headerSection = sections.find((section) => section.kind === "header");
  const headerCopy = copyOf(headerSection);
  const headerLayout = typeof headerSection?.settings?.layout === "string" ? headerSection.settings.layout : "";
  const announcementSection = sections.find((section) => section.kind === "announcement-bar");
  const announcement = announcementSection ? shopperCopy(copyOf(announcementSection).text, store.name) || shopper.announcement : null;
  const footerSection = sections.find((section) => section.kind === "footer");
  const pageTypes = new Set(snapshot.pages.map((page) => page.pageType as string));

  const pageHref = (page: string, params?: URLSearchParams) => storefrontPageHref(storeBasePath, page, params) ?? getPublicStorefrontPath(storeBasePath, "/");
  const go = (page: string) => router.push(pageHref(page));
  const defaultFooterLinks: ChromeLink[] = ["products", "faq", "about", "contact"]
    .filter((key) => pageTypes.has(key))
    .map((key) => ({ key, label: key === "faq" ? "Delivery and FAQ" : LABELS[key]!, onSelect: () => go(key), href: pageHref(key) }));
  const categories = useMemo(() => {
    const map = new Map<string, { slug: string; name: string }>();
    for (const entry of catalog) if (entry.category?.slug) map.set(entry.category.slug, { slug: entry.category.slug, name: entry.category.name });
    return [...map.values()];
  }, [catalog]);
  const menuCtx: MenuContext = {
    hasPage: (key) => Boolean(LABELS[key]) && pageTypes.has(key),
    pageLabel: (key) => LABELS[key],
    pageHref: (key) => pageHref(key),
    goPage: go,
    categories,
    categoryHref: (slug) => pageHref("products", new URLSearchParams({ category: slug })),
    goCategory: (slug) => router.push(pageHref("products", new URLSearchParams({ category: slug }))),
    products: catalog,
    productHref: (id) => getPublicStorefrontPath(storeBasePath, `/product/${id}`),
    storeHref: (path) => getPublicStorefrontPath(storeBasePath, path),
    goProduct: (id) => router.push(getPublicStorefrontPath(storeBasePath, `/product/${id}`)),
  };
  const menu = resolveMenu(readMenu(headerCopy), menuCtx);
  // The phone menu: its own items when the seller chose them (Navigation page or builder), else the main menu.
  const ownMobileMenu = readMobileMenu(headerCopy, headerSection?.settings);
  const mobileMenuItems = ownMobileMenu ? resolveMenu(ownMobileMenu, menuCtx) : undefined;
  // The footer links the seller picked, else the theme's usual ones.
  const savedFooterMenu = readFooterMenu(copyOf(footerSection));
  const footerLinks: ChromeLink[] = savedFooterMenu ? chromeLinksFromMenu(resolveMenu(savedFooterMenu, { ...menuCtx, categoriesUnderShop: false })) : defaultFooterLinks;
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
    <div className={`bq ${BOUTIQUE_FONT_CLASS}`} data-floating-nav="" data-pdp={pdpLayout(look, snapshot)} style={{ ...lookVars(look), minHeight: "100vh" }}>
      <style>{BOUTIQUE_CSS}</style>
      <a href="#bq-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">Skip to product</a>
      <AnnouncementBar text={announcement} look={look} />
      <BoutiqueHeader
        store={store}
        logoText={logoText}
        look={look}
        menu={menu}
        menuStyle={menuStyleOf(headerSection?.settings?.menuStyle)}
        mobileMenu={mobileMenuStyleOf(headerSection?.settings?.mobileMenu)}
        mobileItems={mobileMenuItems}
        mobileExtra={[{ id: "track", label: "Track an order", onSelect: () => setSheet("account"), children: [] }]}
        onHome={() => go("home")}
        onSearch={() => setSheet("search")}
        onWishlist={cartSettings.wishlist ? () => setSheet("wishlist") : undefined}
        onBag={() => setCartOpen(true)}
        cartCount={cart.count}
        wishlistCount={wishlist.productIds.length}
        cartLabel={cartLabel}
        centred={headerLayout === "centered" || (headerLayout !== "split" && headerLayout !== "bold" && look.centredHeader)}
        bold={headerLayout === "bold"}
        market={marketHeaderOf(headerLayout)}
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
            ...(product.category ? [{ label: product.category.name, onSelect: () => router.push(pageHref("products", new URLSearchParams({ category: product.category!.slug }))) }] : []),
            { label: product.name },
          ]}
          shareUrl={shareUrl}
          interactive
          settings={pdpSettings}
          catalog={catalog}
        />
      </main>
      {footerSection ? <BoutiqueFooter store={store} look={look} shopper={shopper} links={footerLinks} showLogo={footerSection.settings?.showLogo !== false} summary={text(copyOf(footerSection).summary)} onTrackOrder={() => setSheet("account")} legalLinks={legalLinks(store.brandSettings).map((link) => ({ key: link.key, label: link.title, href: getPublicStorefrontPath(storeBasePath, legalPagePath(link.key)) }))} /> : null}
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
