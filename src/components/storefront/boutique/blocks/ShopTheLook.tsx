"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { needsOptions, type ShopperProduct } from "../../shopper/catalog";
import { choice, hotspotTooltipPlacement, readHotspots, str, type Hotspot } from "./block-logic";
import { money, SampleLabel, type BlockContext, words } from "./shared";

/** Shop the look: a styled photo with pins on its products, a price card per pin, the list and "Add all to bag". */
export function ShopTheLook({ ctx }: { ctx: BlockContext }) {
  const { copy, settings, items, look, products, store, headingId } = ctx;
  const t = look.tokens;
  const cart = useCart(store.slug);
  const [open, setOpen] = useState<number | null>(null);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const byId = new Map(products.map((product) => [product.id, product]));
  let pins: Hotspot[] = readHotspots(items, new Set(byId.keys()));
  let image = str(copy.imageUrl);
  const sample = ctx.editor && (!pins.length || !image);
  if (sample) {
    if (!image) image = products.find((product) => product.images[0])?.images[0] ?? "";
    if (!pins.length) pins = products.slice(0, 3).map((product, index) => ({ index, x: [32, 64, 48][index]!, y: [38, 30, 70][index]!, productId: product.id, label: "" }));
  }
  if (!pins.length || !image) return ctx.editorHint("Add a photo and pin your products on it in the panel on the right.");

  const pinned = pins.map((pin) => ({ pin, product: byId.get(pin.productId)! }));
  const direct = pinned.map((entry) => entry.product).filter((product, index, all) => !needsOptions(product) && all.indexOf(product) === index);
  const side = choice(settings.imageSide, ["left", "right"] as const, "left");
  const addAll = () => {
    if (!ctx.live) return;
    for (const product of direct) cart.add({ productId: product.id, name: product.name, price: product.retailPrice, image: product.images[0] });
    setAdded(true);
    ctx.openCart?.();
  };
  const name = (pin: Hotspot, product: ShopperProduct) => pin.label || product.name;

  return (
    <section aria-labelledby={headingId} className="bq-wrap py-12">
      <style>{`.bqb-look{display:grid;gap:24px}@container bq (min-width:760px){.bqb-look{grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:40px;align-items:center}.bqb-look[data-side="right"] .bqb-look-img{order:2}}.bqb-pin{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:999px;display:grid;place-items:center;cursor:pointer;border:0;padding:0;box-shadow:0 0 0 6px rgba(255,255,255,.35),0 4px 12px rgba(0,0,0,.25)}@media (prefers-reduced-motion: no-preference){.bqb-pin::after{content:"";position:absolute;inset:-6px;border-radius:999px;border:2px solid rgba(255,255,255,.7);animation:bqb-pulse 2.2s ease-out infinite}}@keyframes bqb-pulse{from{transform:scale(.7);opacity:1}to{transform:scale(1.5);opacity:0}}`}</style>
      {sample ? <SampleLabel look={look} say={ctx.say} /> : null}
      <div className="bqb-look" data-side={side}>
        <div className="bqb-look-img relative" style={{ aspectRatio: "4 / 5" }}>
          <span className="bq-media absolute inset-0 block" style={{ borderRadius: look.cardRadius }}>
            <img src={image} alt={str(copy.title) || "Shop the look"} width={900} height={1125} loading="lazy" decoding="async" />
          </span>
          {pinned.map(({ pin, product }, number) => {
            const expanded = open === pin.index;
            const place = hotspotTooltipPlacement(pin.x, pin.y);
            const href = ctx.productHref(product.id);
            return (
              <div key={pin.index} className="absolute" style={{ left: `${pin.x}%`, top: `${pin.y}%`, zIndex: expanded ? 3 : 2 }}>
                <button
                  type="button"
                  className="bqb-pin"
                  style={{ background: "#fff", color: "#111" }}
                  aria-expanded={expanded}
                  aria-label={`${name(pin, product)}, ${money(product.retailPrice, product.currency)}`}
                  onClick={() => setOpen(expanded ? null : pin.index)}
                >
                  <span className="text-[12px] font-bold" aria-hidden>{number + 1}</span>
                </button>
                {expanded ? (
                  <div
                    role="dialog"
                    aria-label={name(pin, product)}
                    className="absolute w-[220px] rounded-[12px] p-3 text-left shadow-xl"
                    style={{
                      background: "#fff",
                      color: "#111",
                      top: place.vertical === "below" ? 22 : undefined,
                      bottom: place.vertical === "above" ? 22 : undefined,
                      left: place.horizontal === "right" ? -16 : place.horizontal === "center" ? -110 : undefined,
                      right: place.horizontal === "left" ? -16 : undefined,
                    }}
                  >
                    <div className="flex gap-2.5">
                      {product.images[0] ? <img src={product.images[0]} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-[8px] object-cover" /> : null}
                      <div className="min-w-0">
                        <p className="m-0 line-clamp-2 text-[13.5px] font-semibold leading-snug">{name(pin, product)}</p>
                        <p className="m-0 mt-1 text-[13.5px]">{money(product.retailPrice, product.currency)}</p>
                      </div>
                    </div>
                    {href ? (
                      <a href={href} className="mt-2.5 block rounded-full py-2 text-center text-[13px] font-semibold" style={{ background: t.ctaBg, color: t.ctaText }}>View product</a>
                    ) : (
                      <button type="button" onClick={() => ctx.openProduct(product.id)} className="mt-2.5 block w-full rounded-full border-0 py-2 text-[13px] font-semibold" style={{ background: t.ctaBg, color: t.ctaText, cursor: "pointer" }}>View product</button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-4">
          <h2 id={headingId} className="bq-h text-[28px] @3xl:text-[36px]" style={look.headingStyle}>{words(ctx, "title", "Shop the look")}</h2>
          {str(copy.body) ? <p className="m-0 text-[15.5px] leading-7" style={{ color: t.muted }}>{words(ctx, "body")}</p> : null}
          <ol className="m-0 grid list-none gap-2.5 p-0">
            {pinned.map(({ pin, product }, number) => (
              <li key={pin.index}>
                <button type="button" onClick={() => setOpen(pin.index)} className="flex w-full items-center gap-3 rounded-[12px] border p-2.5 text-left" style={{ borderColor: open === pin.index ? t.ink : t.border, background: look.raised, color: t.ink, cursor: "pointer" }}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold" style={{ background: t.ink, color: t.paperBg }} aria-hidden>{number + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{name(pin, product)}</span>
                  <span className="shrink-0 text-[14px] font-semibold">{money(product.retailPrice, product.currency)}</span>
                </button>
              </li>
            ))}
          </ol>
          {str(copy.buttonLabel) && direct.length ? (
            <div>
              <button type="button" className="bq-btn" style={look.solidButton} onClick={() => addAll()} disabled={!ctx.live}>
                <Icon name="bag" size={16} /> {added ? "Added to your bag" : str(copy.buttonLabel)}
              </button>
              {direct.length < new Set(pins.map((pin) => pin.productId)).size ? <p className="m-0 mt-2 text-[12.5px]" style={{ color: t.muted }}>Items with sizes or colours: choose yours on the product page.</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
