"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ShopperProduct } from "../../shopper/catalog";
import { boolSetting, intSetting, readSalePops, salePopSentence, str, wrapIndex, type SalePop } from "./block-logic";
import type { BlockContext } from "./shared";

const SHOW_MS = 6000;

function dismissedKey(slug: string) {
  return `sales-pop-off:${slug}`;
}

function PopCard({ ctx, pop, product, onClose }: { ctx: BlockContext; pop: SalePop; product: ShopperProduct; onClose?: () => void }) {
  const t = ctx.look.tokens;
  const href = ctx.productHref(product.id);
  return (
    <div className="flex w-[300px] max-w-[calc(100vw-24px)] items-center gap-3 rounded-[14px] p-2.5 pr-3 shadow-xl" style={{ background: "#fff", color: "#111", border: `1px solid ${t.border}` }}>
      <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-[10px]" style={{ background: ctx.look.placeholder }}>
        {product.images[0] ? <img src={product.images[0]} alt="" width={56} height={56} className="h-full w-full object-cover" /> : null}
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] leading-[1.35]">
        <span className="block">{salePopSentence(pop)}</span>
        {href ? <a href={href} className="block truncate font-semibold underline-offset-2 hover:underline">{product.name}</a> : <span className="block truncate font-semibold">{product.name}</span>}
        {pop.when ? <span className="block text-[11.5px]" style={{ color: "#6b6b6b" }}>{pop.when}</span> : null}
      </span>
      {onClose ? (
        <button type="button" onClick={onClose} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-0 bg-transparent" style={{ cursor: "pointer", color: "#555" }} aria-label="Hide these notes">
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Recent sales pop-up: seller-entered recent orders as a small corner note, one at a time. Only a cleaned first name
 * and city are ever shown, and only once the seller confirms the orders are real and buyers agreed.
 */
export function SalesPop({ ctx }: { ctx: BlockContext }) {
  const { settings, items, products, store, look } = ctx;
  const byId = new Map(products.map((product) => [product.id, product]));
  const pops = readSalePops(items, new Set(byId.keys()));
  const consent = boolSetting(settings.consent, false);
  const delay = intSetting(settings.delaySeconds, 3, 60, 8) * 1000;
  const gap = intSetting(settings.intervalSeconds, 8, 120, 15) * 1000;
  const right = str(settings.position) === "right";
  const [index, setIndex] = useState<number | null>(null);
  const [off, setOff] = useState(false);
  const active = ctx.live && consent && pops.length > 0 && !off;

  useEffect(() => {
    if (!active) return;
    try {
      if (sessionStorage.getItem(dismissedKey(store.slug)) === "1") {
        setOff(true);
        return;
      }
    } catch {}
    let shown = -1;
    let timer = 0;
    const show = () => {
      shown += 1;
      setIndex(wrapIndex(shown, pops.length));
      timer = window.setTimeout(hide, SHOW_MS);
    };
    const hide = () => {
      setIndex(null);
      // Once through the list is enough.
      if (shown + 1 < pops.length) timer = window.setTimeout(show, gap);
    };
    timer = window.setTimeout(show, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, pops.length, delay, gap, store.slug]);

  if (ctx.editor) {
    const sample: SalePop = pops[0] ?? { firstName: "Ada", city: "Lagos", productId: products[0]?.id ?? "", when: "2 hours ago" };
    const product = byId.get(sample.productId);
    return (
      <div className="bq-wrap py-6">
        <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-dashed p-4" style={{ borderColor: look.tokens.border }}>
          {product ? <PopCard ctx={ctx} pop={sample} product={product} /> : null}
          <p className="m-0 min-w-[200px] flex-1 text-[13px] leading-5" style={{ color: look.tokens.muted }}>
            {!consent
              ? ctx.say("Hidden from shoppers until you confirm these are real orders and buyers agreed (switch in the panel).")
              : pops.length
                ? ctx.say(right ? "Pops up in the bottom right corner {seconds} seconds after a page opens, one sale at a time. Only first names and cities show." : "Pops up in the bottom left corner {seconds} seconds after a page opens, one sale at a time. Only first names and cities show.", { seconds: Math.round(delay / 1000) })
                : ctx.say("Add a few recent sales in the panel on the right. Until then nothing shows to shoppers.")}
          </p>
        </div>
      </div>
    );
  }
  if (!active || index === null) return null;
  const pop = pops[index]!;
  const product = byId.get(pop.productId)!;
  const close = () => {
    setOff(true);
    try {
      sessionStorage.setItem(dismissedKey(store.slug), "1");
    } catch {}
  };
  return (
    <div role="status" aria-live="polite" className="bqb-pop fixed z-40" style={{ [right ? "right" : "left"]: 12 }}>
      <style>{`.bqb-pop{bottom:calc(env(safe-area-inset-bottom, 0px) + 84px)}@media (min-width:768px){.bqb-pop{bottom:24px}}@media (prefers-reduced-motion: no-preference){.bqb-pop{animation:bqb-pop-in .35s ease-out}}@keyframes bqb-pop-in{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}`}</style>
      <PopCard ctx={ctx} pop={pop} product={product} onClose={close} />
    </div>
  );
}
