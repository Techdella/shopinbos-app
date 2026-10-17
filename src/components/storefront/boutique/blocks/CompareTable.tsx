"use client";

import Link from "next/link";
import { needsOptions, type ShopperProduct } from "../../shopper/catalog";
import { boolSetting, comparisonRows, str } from "./block-logic";
import { pickedProductIds } from "./ProductCarousel";
import { money, quickAdd, SampleLabel, Stars, type BlockContext } from "./shared";

/** Comparison table: 2–4 picked products as columns; price, rating and their filled-in details as rows. */
export function CompareTable({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, items, look, products, headingId } = ctx;
  const t = look.tokens;
  const byId = new Map(products.map((product) => [product.id, product]));
  let chosen = pickedProductIds(items).map((id) => byId.get(id)).filter((product): product is ShopperProduct => Boolean(product)).slice(0, 4);
  const sample = ctx.editor && chosen.length < 2;
  if (sample) chosen = products.slice(0, 3);
  if (chosen.length < 2) return ctx.editorHint("Pick two to four products to compare in the panel on the right.");
  const wanted = Array.isArray(copy.rows) ? copy.rows.map(String) : [];
  const rows = comparisonRows(chosen, wanted);
  const cell = "px-3 py-3 text-[14px] align-top";
  const border = { borderTop: `1px solid ${t.border}` };
  return (
    <section aria-labelledby={headingId} className="bq-wrap py-12">
      {sample ? <SampleLabel look={look}>{ctx.say("Sample with your first products. Pick the ones to compare.")}</SampleLabel> : null}
      <h2 id={headingId} className="bq-h text-[26px] @3xl:text-[30px]" style={look.headingStyle}>{str(copy.title) || "Compare"}</h2>
      {str(copy.body) ? <p className="m-0 mt-2 max-w-[620px] text-[15px] leading-7" style={{ color: t.muted }}>{str(copy.body)}</p> : null}
      <div className="mt-6 overflow-x-auto" tabIndex={0} aria-label="Comparison table, scroll sideways on small screens">
        <table className="w-full min-w-[520px] border-collapse text-left" style={{ color: t.ink }}>
          <thead>
            <tr>
              <td className={cell} style={{ width: "22%" }} />
              {chosen.map((product) => {
                const href = ctx.productHref(product.id);
                const inner = (
                  <>
                    <span className="bq-media block" style={{ aspectRatio: "1 / 1", borderRadius: look.cardRadius }}>
                      {product.images[0] ? <img src={product.images[0]} alt="" width={300} height={300} loading="lazy" decoding="async" /> : null}
                    </span>
                    <span className="mt-2 block text-[14.5px] font-semibold leading-snug">{product.name}</span>
                  </>
                );
                return (
                  <th key={product.id} scope="col" className={cell} style={{ fontWeight: 400 }}>
                    {href ? <Link href={href} prefetch={false} className="block">{inner}</Link> : <button type="button" onClick={() => ctx.openProduct(product.id)} className="block w-full border-0 bg-transparent p-0 text-left" style={{ color: "inherit", cursor: "pointer" }}>{inner}</button>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {boolSetting(settings.showPrice, true) ? (
              <tr style={border}>
                <th scope="row" className={cell} style={{ color: t.muted, fontWeight: 500 }}>Price</th>
                {chosen.map((product) => (
                  <td key={product.id} className={cell}>
                    <span className="font-semibold">{money(product.retailPrice, product.currency)}</span>
                    {product.compareAtPrice && product.compareAtPrice > product.retailPrice ? <span className="ml-2 text-[12.5px] line-through" style={{ color: t.muted }}><span className="sr-only">Was </span>{money(product.compareAtPrice, product.currency)}</span> : null}
                  </td>
                ))}
              </tr>
            ) : null}
            {boolSetting(settings.showRating, true) ? (
              <tr style={border}>
                <th scope="row" className={cell} style={{ color: t.muted, fontWeight: 500 }}>Rating</th>
                {chosen.map((product) => <td key={product.id} className={cell}>{product.reviewCount && product.avgRating ? <Stars rating={product.avgRating} count={product.reviewCount} muted={t.muted} /> : <span style={{ color: t.muted }}>No reviews yet</span>}</td>)}
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.label} style={border}>
                <th scope="row" className={cell} style={{ color: t.muted, fontWeight: 500 }}>{row.label}</th>
                {row.values.map((value, index) => <td key={chosen[index]!.id} className={cell}>{value || <span aria-label="Not given" style={{ color: t.muted }}>–</span>}</td>)}
              </tr>
            ))}
            {boolSetting(settings.showButton, true) ? (
              <tr style={border}>
                <td className={cell} />
                {chosen.map((product) => (
                  <td key={product.id} className={cell}>
                    <button type="button" className="bq-btn w-full" style={{ ...look.solidButton, minHeight: 40, fontSize: 13.5, padding: "0 12px" }} onClick={() => quickAdd(ctx, product)} disabled={!ctx.live}>
                      {needsOptions(product) ? "Choose options" : "Add to bag"}
                    </button>
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {ctx.editor && !rows.length ? <p className="m-0 mt-3 text-[12.5px]" style={{ color: t.muted }}>{ctx.say("Add details (material, size, origin…) to these products in Products to compare them row by row.")}</p> : null}
    </section>
  );
}
