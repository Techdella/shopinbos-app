"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CartDrawer } from "@/app/s/[slug]/CartDrawer";
import { rewardTiersFor } from "@/lib/gamification/logic";
import { useCampaignAttribution } from "@/hooks/useCampaignAttribution";
import { useCart } from "@/hooks/useCart";
import { readCartSettings } from "@shared/cart-checkout";
import { useStoreVisitBeacon } from "@/hooks/useStoreVisitor";
import { useWishlist } from "@/hooks/useWishlist";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { storefrontPageHref } from "@shared/storefront-pages";
import { legalLinks, legalPagePath } from "@/lib/legal/pages";
import type { BoutiqueThemeId, StoreEditorSnapshot, TemplateSectionNode } from "@/lib/store-templates";
import { freeDeliveryEverywhereOver, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import type { ShopperProduct } from "../shopper/catalog";
import { ShopperBottomNav, type ShopperSheet } from "../shopper/ShopperBottomNav";
import { resolveMenu } from "../StoreMenu";
import { menuStyleOf, mobileMenuStyleOf, readMenu } from "@/lib/storefront/menu";
import { AnnouncementBar, BoutiqueFooter, BoutiqueHeader, type ChromeLink } from "./BoutiqueChrome";
import { BOUTIQUE_FONT_CLASS } from "./fonts";
import { shopperCopy } from "@shared/placeholder-copy";
import { BOUTIQUE_CSS, boutiqueLook, lookVars, navColors } from "./look";

// Any other page of a 2026-theme store (policies…) inside the theme's own announcement bar, header, footer,
// bottom nav and bag: the same chrome as the product page, around server-rendered children.

interface Props {
  themeId: BoutiqueThemeId;
  snapshot: StoreEditorSnapshot;
  store: { id: string; name: string; slug: string; description?: string | null; logoUrl?: string | null; city?: string | null; country?: string | null; currency: string; brandSettings?: unknown };
  catalog: ShopperProduct[];
  shopper: StorefrontShopperInfo;
  storeBasePath: string;
  children: ReactNode;
}

const LABELS: Record<string, string> = { home: "Home", products: "Shop", about: "About", contact: "Contact", faq: "FAQ" };

function copyOf(section: TemplateSectionNode | undefined): Record<string, unknown> {
  return (section?.blocks.find((entry) => entry.type === "copy")?.content ?? {}) as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function BoutiquePageFrame({ themeId, snapshot, store, catalog, shopper, storeBasePath, children }: Props) {
  const router = useRouter();
  const cart = useCart(store.slug);
  const wishlist = useWishlist(store.slug);
  const cartSettings = readCartSettings(store.brandSettings);
  useCampaignAttribution(store.slug);
  useStoreVisitBeacon(store.slug);
  const [cartOpen, setCartOpen] = useState(false);
  const [sheet, setSheet] = useState<ShopperSheet>(null);
  const look = useMemo(() => boutiqueLook(themeId, snapshot.themeTokens), [themeId, snapshot.themeTokens]);

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
  const footerLinks: ChromeLink[] = ["products", "faq", "about", "contact"]
    .filter((key) => pageTypes.has(key))
    .map((key) => ({ key, label: key === "faq" ? "Delivery and FAQ" : LABELS[key]!, onSelect: () => go(key), href: pageHref(key) }));
  const categories = useMemo(() => {
    const map = new Map<string, { slug: string; name: string }>();
    for (const entry of catalog) if (entry.category?.slug) map.set(entry.category.slug, { slug: entry.category.slug, name: entry.category.name });
    return [...map.values()];
  }, [catalog]);
  const menu = resolveMenu(readMenu(headerCopy), {
    hasPage: (key) => Boolean(LABELS[key]) && pageTypes.has(key),
    pageLabel: (key) => LABELS[key],
    pageHref: (key) => pageHref(key),
    goPage: go,
    categories,
    categoryHref: (slug) => pageHref("products", new URLSearchParams({ category: slug })),
    goCategory: (slug) => router.push(pageHref("products", new URLSearchParams({ category: slug }))),
    products: catalog,
    productHref: (id) => getPublicStorefrontPath(storeBasePath, `/product/${id}`),
    goProduct: (id) => router.push(getPublicStorefrontPath(storeBasePath, `/product/${id}`)),
  });

  const logoText = text(headerCopy.logoText) && text(headerCopy.logoText) !== "Store" ? text(headerCopy.logoText) : store.name;
  const cartLabel = text(headerCopy.cartLabel) && text(headerCopy.cartLabel) !== "Cart" ? text(headerCopy.cartLabel) : "My bag";

  return (
    <div className={`bq ${BOUTIQUE_FONT_CLASS}`} data-floating-nav="" style={{ ...lookVars(look), minHeight: "100vh" }}>
      <style>{BOUTIQUE_CSS}</style>
      <a href="#bq-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-black">Skip to content</a>
      <AnnouncementBar text={announcement} look={look} />
      <BoutiqueHeader
        store={store}
        logoText={logoText}
        look={look}
        menu={menu}
        menuStyle={menuStyleOf(headerSection?.settings?.menuStyle)}
        mobileMenu={mobileMenuStyleOf(headerSection?.settings?.mobileMenu)}
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
      />
      <main id="bq-main" className="bq-page" tabIndex={-1}>
        {children}
      </main>
      {footerSection ? <BoutiqueFooter store={store} look={look} shopper={shopper} links={footerLinks} showLogo={footerSection.settings?.showLogo !== false} summary={text(copyOf(footerSection).summary)} onTrackOrder={() => setSheet("account")} legalLinks={legalLinks(store.brandSettings).map((link) => ({ key: link.key, label: link.title, href: getPublicStorefrontPath(storeBasePath, legalPagePath(link.key)) }))} /> : null}
      <ShopperBottomNav
        storeSlug={store.slug}
        storeName={store.name}
        basePath={storeBasePath}
        products={catalog}
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
