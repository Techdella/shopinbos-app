"use client";

import { useState } from "react";
import { fieldClass, hintClass, labelClass } from "./supplier-kit";

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

export function ChannelPricesFields({ initial, preorderPriceOpen }: { initial: ChannelPricesInitial; preorderPriceOpen: boolean }) {
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

  const choice = (value: "same" | "per_channel", title: string, sub: string) => (
    <label className={`flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[16px] border px-4 py-3 ${mode === value ? "border-app-ink bg-white" : "border-app-line"}`}>
      <input type="radio" name="priceMode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16141F]" />
      <span className="min-w-0">
        <span className="block text-[14px] font-bold">{title}</span>
        <span className="block text-[12.5px] text-app-ink-soft">{sub}</span>
      </span>
    </label>
  );

  return (
    <div className="grid gap-5">
      <fieldset className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">How you price it</legend>
        {choice("same", "Same price for all", "One price for dropship and wholesale")}
        {choice("per_channel", "Different per channel", "Dropship, wholesale breaks and pre-order")}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="product-wholesale" className={labelClass}>{perChannel ? "Wholesale price per piece" : "Price per piece"}</label>
          <input id="product-wholesale" className={fieldClass} name="wholesalePrice" type="number" min="1" step="1" inputMode="numeric" value={base} onChange={(event) => setBase(event.target.value)} required />
          <div className={hintClass}>{perChannel ? "For bulk orders below your first quantity break." : "Sellers pay this for dropship and for wholesale."}</div>
        </div>
        {perChannel && (
          <div>
            <label htmlFor="product-dropship-price" className={labelClass}>Dropship price per piece</label>
            <input id="product-dropship-price" className={fieldClass} name="dropshipPrice" type="number" min="1" step="1" inputMode="numeric" value={dropship} onChange={(event) => setDropship(event.target.value)} placeholder={base || undefined} />
            <div className={hintClass}>1 piece sent to a seller&apos;s customer. Usually a little more than wholesale.</div>
          </div>
        )}
      </div>

      {perChannel && (
        <div>
          <div className={labelClass}>Wholesale quantity breaks</div>
          {rows.length > 0 && (
            <div className="grid gap-2">
              <div className="hidden grid-cols-[1fr_1fr_1.3fr_auto] gap-2 text-[12.5px] font-bold text-app-ink-soft sm:grid">
                <span>From (pieces)</span>
                <span>To (empty = and up)</span>
                <span>Price per piece</span>
                <span className="w-[72px]" />
              </div>
              {rows.map((row, index) => (
                <div key={row.key} className="grid grid-cols-2 gap-2 rounded-[14px] border border-app-line p-2 sm:grid-cols-[1fr_1fr_1.3fr_auto] sm:border-0 sm:p-0">
                  <input aria-label={`Break ${index + 1}: from`} className={fieldClass} name="tierMin" type="number" min="1" step="1" inputMode="numeric" value={row.min} onChange={(event) => update(row.key, { min: event.target.value })} required />
                  <input aria-label={`Break ${index + 1}: to`} className={fieldClass} name="tierMax" type="number" min="1" step="1" inputMode="numeric" value={row.max} placeholder="and up" onChange={(event) => update(row.key, { max: event.target.value })} />
                  <input aria-label={`Break ${index + 1}: price per piece`} className={`${fieldClass} col-span-2 sm:col-span-1`} name="tierPrice" type="number" min="1" step="1" inputMode="numeric" value={row.price} onChange={(event) => update(row.key, { price: event.target.value })} required />
                  <button type="button" onClick={() => setRows(rows.filter((each) => each.key !== row.key))} className="col-span-2 min-h-[44px] rounded-full px-3 text-[13.5px] font-bold text-app-ink-soft underline underline-offset-4 sm:col-span-1 sm:w-[72px]">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addRow} className="mt-2 inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-bold">
            + Add quantity break
          </button>
          <div className={hintClass}>For example 6–23 pieces at ₦8,200 and 24+ at ₦7,500. Bigger quantities should cost the same or less.</div>
        </div>
      )}

      {perChannel && preorderPriceOpen && (
        <div className="max-w-[420px]">
          <label htmlFor="product-preorder-price" className={labelClass}>Pre-order price per piece</label>
          <input id="product-preorder-price" className={fieldClass} name="preorderPrice" type="number" min="1" step="1" inputMode="numeric" defaultValue={initial.preorderPrice ?? ""} placeholder={base || undefined} />
          <div className={hintClass}>What shops pay per piece when they order before it&apos;s ready. Empty: your wholesale price.</div>
        </div>
      )}

      <div className="rounded-[16px] bg-app-canvas p-4">
        <div className="text-[14px] font-extrabold">What sellers charge</div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="product-retail" className={labelClass}>Suggested</label>
            <input id="product-retail" className={fieldClass} name="suggestedRetailPrice" type="number" min="1" step="1" inputMode="numeric" value={suggested} onChange={(event) => setSuggested(event.target.value)} required />
          </div>
          <div>
            <label htmlFor="product-min-retail" className={labelClass}>Lowest allowed (optional)</label>
            <input id="product-min-retail" className={fieldClass} name="minRetailPrice" type="number" min="1" step="1" inputMode="numeric" value={lowest} onChange={(event) => setLowest(event.target.value)} />
            <div className={hintClass}>Stops shops undercutting each other and your wholesale buyers.</div>
          </div>
        </div>
        {cost > 0 && numberOf(suggested) > 0 && (
          <p className={`mb-0 mt-3 text-[13.5px] ${keeps > 0 ? "text-app-ink-soft" : "font-bold text-app-danger"}`}>
            {keeps > 0 ? `A seller who dropships it at ${naira(numberOf(suggested))} keeps ${naira(keeps)} before fees and delivery.` : "The suggested price should be above your dropship price, so sellers can earn."}
          </p>
        )}
      </div>
    </div>
  );
}
