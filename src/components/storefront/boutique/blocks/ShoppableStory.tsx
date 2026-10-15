"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { needsOptions, type ShopperProduct } from "../../shopper/catalog";
import { str } from "./block-logic";
import { itemLink, money, Paragraphs, quickAdd, SampleLabel, type BlockContext } from "./shared";

function InlineProduct({ ctx, product }: { ctx: BlockContext; product: ShopperProduct }) {
  const t = ctx.look.tokens;
  const href = ctx.productHref(product.id);
  const body = (
    <>
      <span className="bq-media block h-20 w-20 shrink-0" style={{ borderRadius: Math.min(ctx.look.cardRadius, 10) }}>
        {product.images[0] ? <img src={product.images[0]} alt="" width={160} height={160} loading="lazy" decoding="async" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{product.name}</span>
        <span className="mt-0.5 block text-[14px]">{money(product.retailPrice, product.currency)}</span>
      </span>
    </>
  );
  return (
    <aside aria-label={`Product: ${product.name}`} className="my-2 flex items-center gap-3 rounded-[14px] p-3" style={{ background: ctx.look.raised, color: t.ink, borderRadius: Math.max(ctx.look.cardRadius, 8) }}>
      {href ? <Link href={href} prefetch={false} className="flex min-w-0 flex-1 items-center gap-3">{body}</Link> : <button type="button" onClick={() => ctx.openProduct(product.id)} className="flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent p-0 text-left" style={{ color: "inherit", cursor: "pointer" }}>{body}</button>}
      <button type="button" className="bq-btn shrink-0" style={{ ...ctx.look.solidButton, minHeight: 40, padding: "0 14px", fontSize: 13.5 }} onClick={() => quickAdd(ctx, product)} disabled={!ctx.live} aria-label={needsOptions(product) ? `Choose options for ${product.name}` : `Add ${product.name} to bag`}>
        <Icon name="bag" size={15} /><span className="hidden @xl:inline">{needsOptions(product) ? "Options" : "Add"}</span>
      </button>
    </aside>
  );
}

/** Shoppable story: a short article; any paragraph can carry a product card with an add to bag button. */
export function ShoppableStory({ ctx }: { ctx: BlockContext }) {
  const { copy, items, look, products, headingId } = ctx;
  const t = look.tokens;
  const byId = new Map(products.map((product) => [product.id, product]));
  let parts = items
    .map((item, index) => {
      const link = itemLink(item);
      return { key: index, heading: str(item.heading), text: str(item.text), product: link?.type === "product" ? byId.get(link.value) ?? null : null };
    })
    .filter((part) => part.heading || part.text || part.product);
  const sample = ctx.editor && !parts.length;
  if (sample) {
    parts = [
      { key: 0, heading: "Start with one piece", text: "Tell the story behind a product, a look or a recipe. Write a few short paragraphs in the panel on the right.", product: products[0] ?? null },
      { key: 1, heading: "Make it yours", text: "Pick a product under any paragraph and it shows right here, ready to add to the bag.", product: products[1] ?? null },
    ];
  }
  if (!parts.length) return null;
  const cover = str(copy.imageUrl);
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-12">
      <article className="mx-auto max-w-[680px]">
        {sample ? <SampleLabel look={look} /> : null}
        {str(copy.eyebrow) ? <p className="m-0 text-[12px] font-semibold uppercase" style={{ color: t.muted, letterSpacing: "0.2em", fontFamily: look.eyebrowFont }}>{str(copy.eyebrow)}</p> : null}
        <h2 id={headingId} className="bq-h mt-2 text-[30px] @3xl:text-[40px]" style={{ ...look.headingStyle, lineHeight: 1.08 }}>{str(copy.title) || "From the journal"}</h2>
        {cover ? <div className="bq-media mt-6" style={{ aspectRatio: "16 / 9", borderRadius: look.cardRadius }}><img src={cover} alt="" width={1200} height={675} loading="lazy" decoding="async" /></div> : null}
        <div className="mt-6 grid gap-4">
          {parts.map((part) => (
            <div key={part.key} className="grid gap-3">
              {part.heading ? <h3 className="bq-h m-0 text-[21px]" style={look.headingStyle}>{part.heading}</h3> : null}
              {part.text ? <div className="grid gap-3 text-[16.5px] leading-[1.75]" style={{ color: t.ink }}><Paragraphs text={part.text} className="m-0" /></div> : null}
              {part.product ? <InlineProduct ctx={ctx} product={part.product} /> : null}
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
