"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import { useStoreVisitBeacon } from "@/hooks/useStoreVisitor";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { parseSharedWishlist, sharedWishlistQuery } from "@shared/cart-checkout";
import { readVariants, type ShopperProduct } from "./catalog";
import { Banner, ProductRow } from "./CartPage";
import { PageTitle, Panel, PrimaryButton, SecondaryButton, ShopperShell } from "./ShopperShell";
import { resolveShopperTheme } from "./theme";
import type { ShopperCommerce, ShopperStore } from "./types";

// /wishlist: the shopper's saved products (move to bag, remove, share), or a list someone shared with them
// (?items=a,b,c — product ids only, nothing personal in the link).

export function WishlistPage({ store, basePath, commerce }: { store: ShopperStore; basePath: string; commerce: ShopperCommerce }) {
  const theme = useMemo(() => resolveShopperTheme(store.brandSettings), [store.brandSettings]);
  const cart = useCart(store.slug);
  const wishlist = useWishlist(store.slug);
  const searchParams = useSearchParams();
  const sharedIds = useMemo(() => parseSharedWishlist(searchParams.get("items")), [searchParams]);
  const shared = sharedIds.length > 0;
  const [notice, setNotice] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  useStoreVisitBeacon(store.slug);

  const byId = useMemo(() => new Map(store.storeProducts.map((product) => [product.id, product])), [store.storeProducts]);
  const ids = shared ? sharedIds : wishlist.productIds;
  const products = ids.map((id) => byId.get(id)).filter((product): product is ShopperProduct => Boolean(product));
  const missing = ids.length - products.length;
  const productHref = (id: string) => getPublicStorefrontPath(basePath, `/product/${id}`);

  if (!commerce.cart.wishlist) {
    return (
      <ShopperShell theme={theme} storeName={store.name} logoUrl={store.logoUrl} basePath={basePath} title="Wishlist" bagCount={cart.count} showWishlist={false}>
        <Panel theme={theme} className="grid justify-items-center gap-3 px-6 py-14 text-center">
          <h1 className="text-[22px] font-semibold" style={{ fontFamily: theme.heading }}>Wishlists aren't available here</h1>
          <p className="text-[15px]" style={{ color: theme.muted }}>{store.name} doesn't use wishlists. You can still add things to your bag.</p>
          <Link href={getPublicStorefrontPath(basePath, "/")} className="mt-2 inline-flex min-h-12 items-center rounded-full px-7 text-[15px] font-semibold" style={{ background: theme.cta, color: theme.ctaText }}>Shop {store.name}</Link>
        </Panel>
      </ShopperShell>
    );
  }

  function addToBag(product: ShopperProduct) {
    cart.add({ productId: product.id, name: product.name, price: product.retailPrice, image: product.images[0] });
    if (!shared) void wishlist.remove(product.id);
    setNotice(`${product.name} ${shared ? "added to" : "moved to"} your bag.`);
  }

  function addAll() {
    const simple = products.filter((product) => readVariants(product.variants).length === 0);
    for (const product of simple) cart.add({ productId: product.id, name: product.name, price: product.retailPrice, image: product.images[0] });
    const left = products.length - simple.length;
    setNotice(`${simple.length} added to your bag.${left ? ` ${left} need${left === 1 ? "s" : ""} options chosen on the product page.` : ""}`);
  }

  async function share() {
    const url = `${window.location.origin}${getPublicStorefrontPath(basePath, "/wishlist")}?${sharedWishlistQuery(wishlist.productIds)}`;
    const text = `My wishlist at ${store.name}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("Link copied. Paste it anywhere to share your wishlist.");
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      setShareStatus(url);
    }
  }

  const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`My wishlist at ${store.name}: ${origin}${getPublicStorefrontPath(basePath, "/wishlist")}?${sharedWishlistQuery(wishlist.productIds)}`)}`;
  const loading = !shared && !wishlist.loaded && !!wishlist.visitorKey;

  return (
    <ShopperShell theme={theme} storeName={store.name} logoUrl={store.logoUrl} basePath={basePath} title="Wishlist" bagCount={cart.count} wishlistCount={wishlist.productIds.length}>
      <p className="sr-only" role="status" aria-live="polite">{notice}</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle theme={theme} sub={shared ? "Someone shared these favourites with you." : products.length ? `${products.length} saved ${products.length === 1 ? "item" : "items"}` : undefined}>
          {shared ? "A shared wishlist" : "Your wishlist"}
        </PageTitle>
        <div className="mb-6 flex flex-wrap gap-2">
          {shared && products.length ? (
            <>
              <PrimaryButton theme={theme} type="button" onClick={addAll}><Icon name="bag" size={16} /> Add all to bag</PrimaryButton>
              <SecondaryButton theme={theme} type="button" onClick={() => { for (const product of products) void wishlist.add(product.id); setNotice("Saved to your wishlist."); }}>
                <Icon name="heart" size={15} /> Save to my wishlist
              </SecondaryButton>
            </>
          ) : null}
          {!shared && products.length ? (
            <>
              <SecondaryButton theme={theme} type="button" onClick={() => void share()}><Icon name="link" size={15} /> Share wishlist</SecondaryButton>
              <a href={whatsappShare} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2" style={{ borderColor: theme.border, background: theme.surface }}>
                <Icon name="whatsapp" size={15} /> WhatsApp
              </a>
            </>
          ) : null}
        </div>
      </div>

      {shareStatus ? <Banner theme={theme} tone="info">{shareStatus}</Banner> : null}
      {notice ? <Banner theme={theme} tone="success">{notice} {notice.includes("bag") ? <Link href={getPublicStorefrontPath(basePath, "/cart")} className="font-semibold underline underline-offset-4">View bag</Link> : null}</Banner> : null}
      {missing > 0 ? <Banner theme={theme} tone="info">{missing} {missing === 1 ? "item is" : "items are"} no longer available.</Banner> : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading your wishlist">
          {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-[18px]" style={{ background: theme.border }} />)}
        </div>
      ) : products.length === 0 ? (
        <Panel theme={theme} className="grid justify-items-center gap-3 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: theme.paper }}><Icon name="heart" size={24} /></span>
          <h2 className="text-[20px] font-semibold" style={{ fontFamily: theme.heading }}>{shared ? "Nothing to show" : "No saved items yet"}</h2>
          <p className="max-w-[42ch] text-[15px]" style={{ color: theme.muted }}>{shared ? "These products are no longer for sale." : "Tap the heart on any product to save it here for later."}</p>
          <Link href={getPublicStorefrontPath(basePath, "/")} className="mt-2 inline-flex min-h-12 items-center rounded-full px-7 text-[15px] font-semibold" style={{ background: theme.cta, color: theme.ctaText }}>Browse {store.name}</Link>
        </Panel>
      ) : (
        <ProductRow
          theme={theme}
          products={products}
          currency={store.currency}
          productHref={productHref}
          actionLabel={shared ? "Add to bag" : "Move to bag"}
          onAction={addToBag}
          secondary={shared ? undefined : { label: () => "Remove", onClick: (product) => { void wishlist.remove(product.id); setNotice(`${product.name} removed from your wishlist.`); } }}
        />
      )}
    </ShopperShell>
  );
}
