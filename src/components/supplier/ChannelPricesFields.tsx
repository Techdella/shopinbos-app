"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { BoardCard, Dot, priceBoxClass, priceInputClass } from "./dropship-ui";

// The product form's prices (Supplier & Dropship Rules, shared/dropship-rules.ts): one switch, "Same price for all"
// or "Different per channel" (a dropship price per piece, wholesale quantity breaks, a pre-order price), then
// what sellers charge: the suggested price and the lowest they may list it at. Posts priceMode, wholesalePrice,
// dropshipPrice, tierMin[] / tierMax[] / tierPrice[], preorderPrice, suggestedRetailPrice and minRetailPrice;
// src/app/actions/supplier.ts reads them and channelPriceProblem checks them together.

export interface ChannelPricesInitial {
  priceMode: "same" | "per_channel";
  wholesalePrice: number | null;
  dropshipPrice: number | null;
  preorderPrice: number | null;
  suggestedRetailPrice: number | null;
  minRetailPrice: number | null;
  tiers: Array<{ minQty: number; maxQty?: number | null; price: number }>;
}

interface Row {
  key: number;
  min: string;
  max: string;
  price: string;
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;
const numberOf = (text: string) => {
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function ChannelPricesFields({ initial, preorderPriceOpen, preorderLocked }: { initial: ChannelPricesInitial; preorderPriceOpen: boolean; /** The locked pre-order card (below Established), shown among the channels. */ preorderLocked?: ReactNode }) {
  const [mode, setMode] = useState(initial.priceMode);
  const [base, setBase] = useState(initial.wholesalePrice ? String(initial.wholesalePrice) : "");
  const [dropship, setDropship] = useState(initial.dropshipPrice ? String(initial.dropshipPrice) : "");
  const [suggested, setSuggested] = useState(initial.suggestedRetailPrice ? String(initial.suggestedRetailPrice) : "");
  const [lowest, setLowest] = useState(initial.minRetailPrice ? String(initial.minRetailPrice) : "");
  const [rows, setRows] = useState<Row[]>(() =>
    initial.tiers.map((tier, index) => ({ key: index, min: String(tier.minQty), max: tier.maxQty ? String(tier.maxQty) : "", price: String(tier.price) })),
  );
  const [nextKey, setNextKey] = useState(initial.tiers.length);
  const perChannel = mode === "per_channel";

  const addRow = () => {
    const last = rows[rows.length - 1];
    const start = last ? (numberOf(last.max) || numberOf(last.min)) + 1 : 6;
    setRows([...rows, { key: nextKey, min: String(start), max: "", price: "" }]);
    setNextKey(nextKey + 1);
  };
  const update = (key: number, patch: Partial<Row>) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  // What a seller pays per piece to dropship it, and so what they'd keep at the suggested price.
  const cost = perChannel && numberOf(dropship) > 0 ? numberOf(dropship) : numberOf(base);
  const keeps = numberOf(suggested) - cost;

  const segment = (value: "same" | "per_channel", title: string) => (
    <label className="relative flex min-h-[40px] min-w-0 cursor-pointer items-center justify-center rounded-full px-3 text-center text-[13.5px] font-extrabold text-app-gray-ink transition has-[:checked]:bg-white has-[:checked]:text-app-ink has-[:checked]:shadow-[0_2px_6px_rgba(22,20,31,0.08)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-app-ink">
      <input type="radio" name="priceMode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
      <span className="truncate">{title}</span>
    </label>
  );

  /** A naira box (`.price` on P-Pricing): ₦ and the figure in Bricolage, a small grey word beside it. */
  const priceBox = (input: ReactNode, opts: { prefix?: ReactNode; suffix?: string; className?: string } = {}) => (
    <div className={cx(priceBoxClass, opts.className)}>
      {opts.prefix}
      <span aria-hidden className="-mr-1.5 font-app-display text-[20px] font-extrabold text-app-ink">₦</span>
      {input}
      {opts.suffix && <span className="shrink-0 text-[12px] font-bold text-app-ink-soft">{opts.suffix}</span>}
    </div>
  );

  const qtyClass = "w-[3.2ch] min-w-0 bg-transparent text-right text-[13px] font-bold text-app-ink-soft outline-none placeholder:text-app-ink-faint focus:text-app-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <div className="grid gap-3">
      <fieldset className="m-0 grid max-w-[560px] grid-cols-2 gap-0 rounded-full border-0 bg-app-line p-1">
        <legend className="sr-only">How you price it</legend>
        {segment("same", "Same price for all")}
        {segment("per_channel", "Different per channel")}
      </fieldset>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {perChannel ? (
          <BoardCard className="grid content-start gap-2.5">
            <div className="flex items-center gap-2">
              <Dot className="bg-app-violet" />
              <label htmlFor="product-dropship-price" className="text-[15px] font-extrabold">Dropship</label>
              <span className="ml-auto truncate text-[12px] font-semibold text-app-ink-soft">1 piece to a customer</span>
            </div>
            {priceBox(<input id="product-dropship-price" className={priceInputClass} name="dropshipPrice" type="number" min="1" step="1" inputMode="numeric" value={dropship} onChange={(event) => setDropship(event.target.value)} placeholder={base || undefined} aria-describedby="product-dropship-hint" />, { suffix: "per piece" })}
            <p id="product-dropship-hint" className="m-0 text-[12px] text-app-ink-soft">Usually a little more than wholesale. Empty: your wholesale price.</p>
          </BoardCard>
        ) : null}

        <BoardCard className={cx("grid content-start gap-2.5", !perChannel && "lg:col-span-2")}>
          <div className="flex items-center gap-2">
            {perChannel && <Dot className="bg-app-forest" />}
            <label htmlFor="product-wholesale" className="text-[15px] font-extrabold">{perChannel ? "Wholesale" : "One price for dropship and wholesale"}</label>
            {perChannel && <span className="ml-auto truncate text-[12px] font-semibold text-app-ink-soft">Bulk to a shop</span>}
          </div>
          {priceBox(
            <input id="product-wholesale" className={priceInputClass} name="wholesalePrice" type="number" min="1" step="1" inputMode="numeric" value={base} onChange={(event) => setBase(event.target.value)} required aria-describedby="product-wholesale-hint" />,
            { suffix: perChannel && rows.length ? `below ${numberOf(rows[0].min) || "the first break"}` : "per piece", className: perChannel ? undefined : "max-w-[420px]" },
          )}
          <p id="product-wholesale-hint" className="m-0 text-[12px] text-app-ink-soft">{perChannel ? "For bulk orders below your first quantity break." : "Sellers pay this for dropship and for wholesale."}</p>
          {perChannel && (
            <>
              {rows.length > 0 && (
                <ul className="m-0 grid list-none gap-2 p-0" aria-label="Wholesale quantity breaks">
                  {rows.map((row, index) => (
                    <li key={row.key} className="flex min-w-0 items-center gap-2">
                      <div className={cx(priceBoxClass, "h-11 flex-1 gap-1")}>
                        <input aria-label={`Break ${index + 1}: from (pieces)`} className={qtyClass} name="tierMin" type="number" min="1" step="1" inputMode="numeric" value={row.min} onChange={(event) => update(row.key, { min: event.target.value })} required />
                        <span aria-hidden className="text-[13px] font-bold text-app-ink-soft">–</span>
                        <input aria-label={`Break ${index + 1}: to (empty = and up)`} className={cx(qtyClass, "text-left")} name="tierMax" type="number" min="1" step="1" inputMode="numeric" value={row.max} placeholder="up" onChange={(event) => update(row.key, { max: event.target.value })} />
                        <span aria-hidden className="ml-auto font-app-display text-[17px] font-extrabold">₦</span>
                        <input aria-label={`Break ${index + 1}: price per piece`} className={cx(priceInputClass, "w-[6.5ch] flex-none text-[17px]")} name="tierPrice" type="number" min="1" step="1" inputMode="numeric" value={row.price} onChange={(event) => update(row.key, { price: event.target.value })} required />
                      </div>
                      <button type="button" aria-label={`Remove break ${index + 1}`} onClick={() => setRows(rows.filter((each) => each.key !== row.key))} className="grid h-11 w-9 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas hover:text-app-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink">
                        <Icon name="x" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={addRow} className="justify-self-start rounded-full py-1 text-[13px] font-extrabold text-app-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink">
                + Add quantity break
              </button>
              <p className="m-0 text-[12px] text-app-ink-soft">For example 6–23 pieces at ₦8,200 and 24+ at ₦7,500. Bigger quantities should cost the same or less.</p>
            </>
          )}
        </BoardCard>

        {perChannel && preorderPriceOpen && (
          <BoardCard className="grid content-start gap-2.5">
            <div className="flex items-center gap-2">
              <Dot className="bg-app-accent" />
              <label htmlFor="product-preorder-price" className="text-[15px] font-extrabold">Pre-order</label>
              <span className="ml-auto truncate text-[12px] font-semibold text-app-ink-soft">Before it&apos;s ready</span>
            </div>
            {priceBox(<input id="product-preorder-price" className={priceInputClass} name="preorderPrice" type="number" min="1" step="1" inputMode="numeric" defaultValue={initial.preorderPrice ?? ""} placeholder={base || undefined} />, { suffix: "per piece" })}
            <p className="m-0 text-[12px] text-app-ink-soft">What shops pay per piece when they order before it&apos;s ready. Empty: your wholesale price.</p>
          </BoardCard>
        )}
        {!preorderPriceOpen && preorderLocked}

        <BoardCard className="grid content-start gap-2.5">
          <div className="text-[15px] font-extrabold">What sellers charge</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid min-w-0 gap-1">
              <label htmlFor="product-retail" className="text-[12px] font-bold text-app-ink-soft">Suggested</label>
              {priceBox(<input id="product-retail" className={cx(priceInputClass, "text-[17px]")} name="suggestedRetailPrice" type="number" min="1" step="1" inputMode="numeric" value={suggested} onChange={(event) => setSuggested(event.target.value)} required />, { className: "h-11" })}
            </div>
            <div className="grid min-w-0 gap-1">
              <label htmlFor="product-min-retail" className="text-[12px] font-bold text-app-ink-soft">Lowest allowed</label>
              {priceBox(<input id="product-min-retail" className={cx(priceInputClass, "text-[17px]")} name="minRetailPrice" type="number" min="1" step="1" inputMode="numeric" value={lowest} onChange={(event) => setLowest(event.target.value)} placeholder="Optional" aria-describedby="product-min-retail-hint" />, { className: "h-11" })}
            </div>
          </div>
          <p id="product-min-retail-hint" className="m-0 text-[12px] text-app-ink-soft">The lowest stops shops undercutting each other and your wholesale buyers.</p>
          {cost > 0 && numberOf(suggested) > 0 && (
            <p className={cx("m-0 rounded-[12px] px-3 py-2 text-[13px]", keeps > 0 ? "bg-app-success-tint font-bold text-app-success" : "bg-app-danger-tint font-bold text-app-danger")}>
              {keeps > 0 ? `A seller who dropships it at ${naira(numberOf(suggested))} keeps ${naira(keeps)} before fees and delivery.` : "The suggested price should be above your dropship price, so sellers can earn."}
            </p>
          )}
        </BoardCard>
      </div>
    </div>
  );
}
