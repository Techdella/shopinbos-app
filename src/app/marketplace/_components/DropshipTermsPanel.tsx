"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/app-ui/cx";
import { ChipChoice, ChipRow } from "@/components/supplier/dropship-ui";
import { Icon } from "@/components/ui/Icon";
import { DELIVERY_PAYERS, DELIVERY_PAYER_LABELS, type DeliveryPayer } from "@shared/dropship-rules";
import { cleanListingChoice, type DropshipTerms } from "@shared/dropship-checkout";
import { timeframeWords } from "@shared/delivery-market";

// The dropship side of a supplier's product page in Find products (the owner's "Supplier & Dropship Rules"): what you
// pay, your price and what you earn on each order (live as the price and choices change), the lowest price allowed,
// where it ships from and what delivery costs to your state, who pays delivery and your own SKU or barcode. Suppliers
// don't offer seller branding: every parcel is packed plain, with your shop's name on tracking and the invoice.
// The add check on the server (src/lib/marketplace/dropship-listing.server.ts) is the same.

const CARD = "rounded-[18px] bg-white";

export interface ListingChoiceState {
  payer: DeliveryPayer;
  flatFee: string;
  sku: string;
}

export const START_CHOICE: ListingChoiceState = { payer: "customer", flatFee: "", sku: "" };

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
  priceControl,
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
  /** The price stepper, shown in the YOUR PRICE tile (else the price as text). */
  priceControl?: ReactNode;
}) {
  const clean = cleanListingChoice(terms, { retailPrice: price, payer: choice.payer, flatFee: choice.flatFee === "" ? null : Number(choice.flatFee) });
  const deliveryShare = clean.payer === "seller" ? terms.dearestDelivery : clean.payer === "flat" ? Math.max(0, terms.dearestDelivery - (clean.flatFee ?? 0)) : 0;
  const earn = price - terms.cost - deliveryShare - paymentFee;
  const set = (patch: Partial<ListingChoiceState>) => onChange({ ...choice, ...patch });

  const tile = "min-w-0 rounded-[16px] px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.04em] text-app-ink-soft";
  const figure = "mt-0.5 block font-app-display text-[18px] font-extrabold normal-case tracking-normal text-app-ink";

  return (
    <>
      <section aria-labelledby="dropship-money" className="grid gap-1.5">
        <h2 id="dropship-money" className="sr-only">On each order</h2>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className={cx(tile, "bg-white")}>You pay<span className={figure}>{money(terms.cost)}</span></div>
          <div className={cx(tile, "order-first col-span-2 border-2 border-app-ink bg-white px-2 py-1.5 sm:order-none sm:col-span-1")}>
            Your price
            {priceControl ?? <span className={figure}>{money(price)}</span>}
          </div>
          <div className={cx(tile, earn > 0 ? "bg-app-success-tint" : "bg-app-danger-tint")}>
            You earn
            <output aria-live="polite" className={cx(figure, earn > 0 ? "text-app-success" : "text-app-danger")}>{money(earn)}</output>
          </div>
        </div>
        <p className="m-0 px-0.5 text-[12px] text-app-ink-soft">
          Lowest price allowed: <strong className="text-app-ink">{money(terms.floor)}</strong>
          {terms.minRetailPrice ? ` (set by ${supplierName})` : ""}.
        </p>
        {problem ? <p role="alert" className="m-0 rounded-[12px] bg-app-danger-tint px-3 py-2 text-[13px] font-bold text-app-danger">{problem}</p> : null}
        <details className="group rounded-[16px] bg-white px-3 py-2 text-[13px]">
          <summary className="flex min-h-[32px] cursor-pointer list-none items-center justify-between gap-2 font-bold text-app-ink-soft marker:hidden">
            How you earn {money(earn)} on each order
            <Icon name="chevDown" size={14} className="shrink-0 transition group-open:rotate-180" />
          </summary>
          <dl className="m-0 mb-1 mt-1 grid gap-1.5">
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Your price</dt><dd className="m-0 font-bold">{money(price)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="min-w-0 truncate text-app-ink-soft">You pay {supplierName}</dt><dd className="m-0 font-bold">−{money(terms.cost)}</dd></div>
            <div className="flex justify-between gap-3">
              <dt className="text-app-ink-soft">{clean.payer === "customer" ? "Delivery" : "Delivery you cover (up to)"}</dt>
              <dd className="m-0 font-bold">{clean.payer === "customer" ? "Customer pays" : `−${money(deliveryShare)}`}</dd>
            </div>
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Card payment fee</dt><dd className="m-0 font-bold">−{money(paymentFee)}</dd></div>
          </dl>
        </details>
      </section>

      <section className={cx(CARD, "grid gap-2 px-3 py-[11px] text-[14px]")} aria-labelledby="dropship-delivery">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h2 id="dropship-delivery" className="m-0 text-[14px] font-extrabold">Delivery to your customers</h2>
          {terms.deliveryToYou ? (
            <span className="text-[12px] font-bold text-app-gray-ink">{terms.deliveryToYou.zoneLabel}: {money(terms.deliveryToYou.price)} · {timeframeWords(terms.deliveryToYou.minDays, terms.deliveryToYou.maxDays)}</span>
          ) : null}
        </div>
        <p className="m-0 flex items-start gap-1.5 text-[12px] leading-[1.45] text-app-ink-soft">
          <Icon name="truck" size={14} className="mt-px shrink-0" />
          <span className="min-w-0">
            {terms.shipsFrom ? `Ships from ${terms.shipsFrom} · ` : ""}
            {terms.options.join(" · ")}
            {terms.stockState === "low" ? <span className="font-extrabold text-app-warn"> · Only {terms.stock} left</span> : null}
          </span>
        </p>
        {!terms.deliveryToYou ? (
          <p className="m-0 text-[12.5px] text-app-ink-soft">
            {terms.rateSource === "own" ? "The supplier's delivery prices are worked out at checkout from your customer's address." : "Delivery partners' prices are worked out at checkout from your customer's address."}
          </p>
        ) : null}

        <fieldset className="m-0 grid gap-2 border-0 p-0" disabled={disabled}>
          <legend className="sr-only">Who pays delivery</legend>
          <ChipRow className="gap-1.5">
            {DELIVERY_PAYERS.map((payer) => (
              <ChipChoice key={payer} size="sm" name="dropship-payer" value={payer} checked={choice.payer === payer} onChange={() => set({ payer })} label={DELIVERY_PAYER_LABELS[payer]} />
            ))}
          </ChipRow>
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
                className="h-9 w-[110px] rounded-[10px] border-2 border-app-line px-2.5 text-right text-[14px] font-bold outline-none focus:border-app-ink"
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

      <section className={cx(CARD, "grid gap-2 px-3 py-[11px] text-[14px]")} aria-labelledby="dropship-packing">
        <h2 id="dropship-packing" className="m-0 text-[14px] font-extrabold">Packing</h2>
        <p className="m-0 text-[12.5px] text-app-ink-soft">Packed plain: your shop&apos;s name is on tracking and the invoice.</p>
        <label className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-app-gray-ink">
          <span>Your SKU or barcode</span>
          <input
            value={choice.sku}
            maxLength={64}
            onChange={(event) => set({ sku: event.target.value })}
            placeholder="Optional, e.g. ADA-TOTE-01"
            disabled={disabled}
            aria-describedby="dropship-sku-help"
            className="h-9 min-w-[150px] flex-1 rounded-[10px] border-2 border-app-line px-2.5 text-[13px] font-bold text-app-ink outline-none placeholder:font-semibold placeholder:text-app-ink-faint focus:border-app-ink"
          />
        </label>
        <span id="dropship-sku-help" className="text-[11.5px] text-app-ink-soft">Shown in the supplier&apos;s order list.</span>
      </section>
    </>
  );
}
