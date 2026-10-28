"use client";

import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { DELIVERY_PAYERS, DELIVERY_PAYER_LABELS, type DeliveryPayer } from "@shared/dropship-rules";
import { cleanListingChoice, type DropshipTerms } from "@shared/dropship-checkout";
import { timeframeWords } from "@shared/delivery-market";

// The dropship side of a supplier's product page in Find products (the owner's "Supplier & Dropship Rules"): what you
// pay, your price and what you earn on each order (live as the price and choices change), the lowest price allowed,
// where it ships from and what delivery costs to your state, who pays delivery, the branding the supplier offers and
// your own SKU or barcode. The add check on the server (src/lib/marketplace/dropship-listing.server.ts) is the same.

const CARD = "rounded-[20px] border border-app-line bg-white";

export interface ListingChoiceState {
  payer: DeliveryPayer;
  flatFee: string;
  branding: string;
  sku: string;
}

export const START_CHOICE: ListingChoiceState = { payer: "customer", flatFee: "", branding: "blind", sku: "" };

export function DropshipTermsPanel({
  terms,
  price,
  paymentFee,
  supplierName,
  choice,
  onChange,
  money,
  problem,
  disabled = false,
}: {
  terms: DropshipTerms;
  price: number;
  /** The card payment fee on a sale at this price (src/lib/marketplace/find.ts paymentFee). */
  paymentFee: number;
  supplierName: string;
  choice: ListingChoiceState;
  onChange: (next: ListingChoiceState) => void;
  money: (amount: number) => string;
  problem: string | null;
  disabled?: boolean;
}) {
  const clean = cleanListingChoice(terms, { retailPrice: price, payer: choice.payer, flatFee: choice.flatFee === "" ? null : Number(choice.flatFee), brandingChoice: choice.branding });
  const deliveryShare = clean.payer === "seller" ? terms.dearestDelivery : clean.payer === "flat" ? Math.max(0, terms.dearestDelivery - (clean.flatFee ?? 0)) : 0;
  const earn = price - terms.cost - deliveryShare - clean.brandingFee - paymentFee;
  const set = (patch: Partial<ListingChoiceState>) => onChange({ ...choice, ...patch });

  return (
    <>
      <section className={cx(CARD, "p-4")} aria-labelledby="dropship-money">
        <h2 id="dropship-money" className="m-0 text-[14.5px] font-extrabold">On each order</h2>
        <dl className="m-0 mt-2 grid gap-2 text-[14px]">
          <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Your price</dt><dd className="m-0 font-bold">{money(price)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="min-w-0 truncate text-app-ink-soft">You pay {supplierName}</dt><dd className="m-0 font-bold">−{money(terms.cost)}</dd></div>
          <div className="flex justify-between gap-3">
            <dt className="text-app-ink-soft">{clean.payer === "customer" ? "Delivery" : "Delivery you cover (up to)"}</dt>
            <dd className="m-0 font-bold">{clean.payer === "customer" ? "Customer pays" : `−${money(deliveryShare)}`}</dd>
          </div>
          {clean.brandingFee > 0 ? <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Branding per parcel</dt><dd className="m-0 font-bold">−{money(clean.brandingFee)}</dd></div> : null}
          <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Card payment fee</dt><dd className="m-0 font-bold">−{money(paymentFee)}</dd></div>
        </dl>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-app-line pt-3">
          <span className="text-[14.5px] font-extrabold">You earn</span>
          <output aria-live="polite" className={cx("text-[17px] font-extrabold", earn > 0 ? "text-app-success" : "text-app-danger")}>{money(earn)}</output>
        </div>
        <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">
          Lowest price allowed: <strong className="text-app-ink">{money(terms.floor)}</strong>
          {terms.minRetailPrice ? ` (set by ${supplierName})` : ""}
        </p>
        {problem ? <p role="alert" className="mb-0 mt-2 rounded-[12px] bg-app-danger-tint px-3 py-2 text-[13px] font-bold text-app-danger">{problem}</p> : null}
      </section>

      <section className={cx(CARD, "grid gap-2 p-4 text-[14px]")} aria-labelledby="dropship-delivery">
        <h2 id="dropship-delivery" className="m-0 text-[14.5px] font-extrabold">Delivery</h2>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {terms.options.map((word) => (
            <li key={word} className="rounded-full bg-app-canvas px-2.5 py-1 font-mono text-[11.5px] tracking-[0.04em]">{word}</li>
          ))}
          {terms.stockState === "low" ? <li className="rounded-full bg-[#FDF0D5] px-2.5 py-1 text-[11.5px] font-bold text-[#8A5A00]">Only {terms.stock} left</li> : null}
        </ul>
        {terms.shipsFrom ? (
          <p className="m-0 flex items-center gap-2"><Icon name="truck" size={15} className="text-app-ink-soft" /> Ships from {terms.shipsFrom}</p>
        ) : null}
        {terms.deliveryToYou ? (
          <p className="m-0 text-app-ink-soft">
            To your state ({terms.deliveryToYou.zoneLabel.toLowerCase()}): <strong className="text-app-ink">{money(terms.deliveryToYou.price)}</strong> · {timeframeWords(terms.deliveryToYou.minDays, terms.deliveryToYou.maxDays)}
          </p>
        ) : (
          <p className="m-0 text-[13px] text-app-ink-soft">
            {terms.rateSource === "own" ? "The supplier's delivery prices are worked out at checkout from your customer's address." : "Delivery partners' prices are worked out at checkout from your customer's address."}
          </p>
        )}

        <fieldset className="m-0 mt-1 grid gap-2 border-0 p-0" disabled={disabled}>
          <legend className="mb-1 p-0 text-[13px] font-bold">Who pays delivery</legend>
          <div className="flex flex-wrap gap-2">
            {DELIVERY_PAYERS.map((payer) => (
              <button
                key={payer}
                type="button"
                aria-pressed={choice.payer === payer}
                onClick={() => set({ payer })}
                className={cx("min-h-[40px] rounded-full border px-3.5 text-[13px] font-bold", choice.payer === payer ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
              >
                {DELIVERY_PAYER_LABELS[payer]}
              </button>
            ))}
          </div>
          {choice.payer === "flat" ? (
            <label className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-bold">Your customers pay</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={100}
                value={choice.flatFee}
                onChange={(event) => set({ flatFee: event.target.value })}
                className="h-10 w-[120px] rounded-[12px] border border-app-line px-3 text-right text-[14px] font-bold outline-none focus:border-app-ink"
                aria-describedby="flat-fee-help"
              />
              <span id="flat-fee-help" className="text-app-ink-soft">anywhere. You cover the rest.</span>
            </label>
          ) : null}
          {choice.payer !== "customer" && terms.dearestIsEstimate ? (
            <p className="m-0 text-[12.5px] text-app-ink-soft">Delivery goes through partners, so &quot;up to&quot; uses Shopinbos&apos;s starting rates for the farthest zone.</p>
          ) : null}
        </fieldset>
      </section>

      <section className={cx(CARD, "grid gap-2 p-4 text-[14px]")} aria-labelledby="dropship-branding">
        <h2 id="dropship-branding" className="m-0 text-[14.5px] font-extrabold">Your branding</h2>
        <p className="m-0 text-[12.5px] text-app-ink-soft">Every parcel is packed plain with no supplier name or price inside, and tracking shows your shop&apos;s name.</p>
        {terms.branding.length > 1 ? (
          <fieldset className="m-0 grid gap-1.5 border-0 p-0" disabled={disabled}>
            <legend className="sr-only">Branding on each parcel</legend>
            {terms.branding.map((option) => (
              <label key={option.choice} className={cx("flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-[14px] border px-3", choice.branding === option.choice ? "border-app-ink" : "border-app-line")}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="dropship-branding" value={option.choice} checked={choice.branding === option.choice} onChange={() => set({ branding: option.choice })} />
                  {option.label}
                </span>
                <span className="font-mono text-[12px] text-app-ink-soft">{option.fee > 0 ? `+${money(option.fee)} per parcel` : "Free"}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <label className="mt-1 grid gap-1">
          <span className="text-[13px] font-bold">Your SKU or barcode <span className="font-normal text-app-ink-soft">(optional)</span></span>
          <input
            value={choice.sku}
            maxLength={64}
            onChange={(event) => set({ sku: event.target.value })}
            placeholder="e.g. ADA-TOTE-01"
            disabled={disabled}
            className="h-11 w-full rounded-[12px] border border-app-line px-3 text-[14px] outline-none focus:border-app-ink"
          />
          <span className="text-[12px] text-app-ink-soft">Printed on the packing slip and shown in the supplier&apos;s order list.</span>
        </label>
      </section>
    </>
  );
}
