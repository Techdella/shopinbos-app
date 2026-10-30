"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/hooks/useCart";
import { RECENTLY_VIEWED_EVENT, readRecentlyViewed, recentlyViewedKey, viewedProducts } from "@/lib/storefront/recently-viewed";
import { SectionTitle } from "../BoutiqueChrome";
import { boolSetting, intSetting, recommendProducts, str } from "./block-logic";
import { BlockProductCard, SampleLabel, type BlockContext, words } from "./shared";

/** This shopper's recently viewed product ids (read after mount, kept in sync across tabs). */
export function useRecentlyViewed(storeSlug: string) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const update = () => setIds(readRecentlyViewed(storeSlug));
    update();
    const onStorage = (event: StorageEvent) => { if (event.key === recentlyViewedKey(storeSlug)) update(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener(RECENTLY_VIEWED_EVENT, update);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(RECENTLY_VIEWED_EVENT, update);
    };
  }, [storeSlug]);
  return ids;
}

function ProductRow({ ctx, title, list, sample }: { ctx: BlockContext; title: string; list: BlockContext["products"]; sample: string | null }) {
  return (
    <section aria-labelledby={ctx.headingId} className="bq-wrap py-10">
      {sample ? <SampleLabel look={ctx.look}>{sample}</SampleLabel> : null}
      <SectionTitle look={ctx.look} id={ctx.headingId}>{words(ctx, "title", title)}</SectionTitle>
      <div className="bq-shop-grid">
        {list.map((product) => <BlockProductCard key={product.id} ctx={ctx} product={product} />)}
      </div>
    </section>
  );
}

/** Recently viewed: the products this shopper opened, newest first, from their own device. Hidden until there are some. */
export function RecentlyViewed({ ctx }: { ctx: BlockContext }) {
  const ids = useRecentlyViewed(ctx.store.slug);
  const limit = intSetting(ctx.settings.limit, 2, 12, 8);
  let list = viewedProducts(ids, ctx.products).slice(0, limit);
  let sample: string | null = null;
  if (!list.length && ctx.editor) {
    list = ctx.products.slice(0, Math.min(4, limit));
    sample = ctx.say("Sample. Each shopper sees the products they looked at.");
  }
  if (!list.length) return null;
  return <ProductRow ctx={ctx} title={str(ctx.copy.title) || "Recently viewed"} list={list} sample={sample} />;
}

/** You may also like: related to what's in the bag and what the shopper viewed; best sellers for new visitors. */
export function AlsoLike({ ctx }: { ctx: BlockContext }) {
  const ids = useRecentlyViewed(ctx.store.slug);
  const cart = useCart(ctx.store.slug);
  const limit = intSetting(ctx.settings.limit, 2, 12, 8);
  const seeds = [...cart.items.map((line) => line.productId), ...ids];
  const fallback = boolSetting(ctx.settings.fallbackBest, true);
  const list = seeds.length || fallback || ctx.editor ? recommendProducts(seeds, ctx.products, limit) : [];
  if (!list.length) return ctx.editorHint("Recommendations show here once you add products.");
  return <ProductRow ctx={ctx} title={str(ctx.copy.title) || "You may also like"} list={list} sample={ctx.editor && !seeds.length ? ctx.say("Preview: new visitors see best sellers; returning shoppers see picks based on their bag and views.") : null} />;
}
