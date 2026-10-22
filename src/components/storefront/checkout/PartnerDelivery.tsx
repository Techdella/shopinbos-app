"use client";

// Delivery options from the seller's delivery partners (Logistics marketplace, shared/delivery-market.ts), as the
// checkout quote API returns them when the seller switched checkout to delivery partners. Only the server can work
// them out (rate cards, coverage, pickup points), so the bag, checkout and payment-link pages show these instead of
// the store's zones. Also: which ways to pay go with the chosen option (pay on delivery is agreed per partner).

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import type { MarketOption } from "@shared/delivery-market";
import { checkoutPaymentOptions, partnerPayOnDeliveryBlock, payOnDeliveryOption, type CheckoutPaymentContext, type CheckoutPaymentOption, type CheckoutPaymentSettings } from "@shared/checkout-payments";

/** The quote API's `delivery` (src/app/api/public/store/[slug]/checkout/quote). */
export interface QuotedDelivery {
  covered: boolean;
  optionId: string | null;
  options: MarketOption[];
  /** True when these are delivery partners' options (else the store's zones priced it). */
  partners: boolean;
  reason: string | null;
  shipmentCount: number;
}

/** Reads the quote's delivery block; null when it isn't there (an older server). */
export function readQuotedDelivery(value: unknown): QuotedDelivery | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<QuotedDelivery>;
  return {
    covered: raw.covered !== false,
    optionId: typeof raw.optionId === "string" ? raw.optionId : null,
    options: Array.isArray(raw.options) ? (raw.options as MarketOption[]) : [],
    partners: raw.partners === true,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    shipmentCount: typeof raw.shipmentCount === "number" ? raw.shipmentCount : 1,
  };
}

/** A partner carries it (not the seller's own pickup or the seller's fallback delivery). */
export const isPartnerOption = (option: Pick<MarketOption, "kind">) => option.kind !== "self_pickup" && option.kind !== "fallback";

/**
 * The option books at least one delivery partner job (same test as the checkout API's partnerShipments): then the
 * shopper verifies their phone with a code (PhoneCheck.tsx) before the order goes in.
 */
export const hasPartnerParcels = (option: Pick<MarketOption, "parts"> | null | undefined) =>
  Array.isArray(option?.parts) && option.parts.some((part) => !!part.partnerId && !!part.connectionId);

/**
 * The ways to pay with delivery partners, as the checkout API accepts them: with a partner option, pay on delivery
 * only when the seller has it switched on, the order is within the seller's cap and that option allows it (the shop
 * and the partner both opted in): partnerPayOnDeliveryBlock. With pickup from the seller or the seller's fallback
 * delivery, the store's own pay-on-delivery rules. No option yet: no pay on delivery.
 */
export function partnerPaymentOptions(settings: CheckoutPaymentSettings, context: CheckoutPaymentContext, option: Pick<MarketOption, "kind" | "pod"> | null): CheckoutPaymentOption[] {
  const store = checkoutPaymentOptions(settings, context);
  if (option && !isPartnerOption(option)) return store;
  const rest = store.filter((entry) => entry.key !== "pay_on_delivery");
  return option && !partnerPayOnDeliveryBlock(settings, context, option.pod === true) ? [...rest, payOnDeliveryOption()] : rest;
}

/** Why the shopper can't go on with delivery yet (partners mode), or null. */
export function partnerDeliveryProblem(input: { hasAddress: boolean; pending: boolean; delivery: QuotedDelivery | null }): string | null {
  if (!input.hasAddress) return "Choose your state and area to see delivery options.";
  if (input.pending) return "We're still checking delivery options for your address. Try again in a moment.";
  if (!input.delivery) return "We couldn't load delivery options. Check your address and try again.";
  if (!input.delivery.covered || input.delivery.options.length === 0) return input.delivery.reason ?? "No delivery is available to this address yet.";
  return null;
}

const ERROR = "#B42318";

/**
 * The delivery choices: pickup from the seller, doorstep and same-day partners, the seller's fallback, then the
 * pickup points near the address under their own heading. Prices say Free for 0; a badge shows where pay on delivery
 * is allowed; parcels from different places explain their separate fees.
 */
export function PartnerDeliveryChoices({
  theme,
  delivery,
  pending,
  hasAddress,
  selectedOptionId,
  onSelect,
  currency,
  preview = false,
  payOnDelivery = true,
  name = "deliveryOption",
  id = "co-deliveryOption",
  area = null,
  storePayOnDelivery,
}: {
  /** "Wuse 2, Abuja": shown as "To Wuse 2, Abuja" above the options. */
  area?: string | null;
  /**
   * Whether the store's own rules allow pay on delivery here (for pickup from the seller and the seller's fallback
   * delivery). With it, "Pay on delivery isn't offered for this order." shows when no option allows it.
   */
  storePayOnDelivery?: boolean;
  theme: ShopperTheme;
  delivery: QuotedDelivery | null;
  pending: boolean;
  hasAddress: boolean;
  selectedOptionId: string | null;
  onSelect: (id: string) => void;
  currency: string;
  /** Owner preview: nothing is quoted, so say where the options will come from. */
  preview?: boolean;
  /** The seller has pay on delivery switched on; when off, no option says pay on delivery is available. */
  payOnDelivery?: boolean;
  name?: string;
  id?: string;
}) {
  if (preview) {
    return <p className="text-[14px]" style={{ color: theme.muted }}>Delivery options from your delivery partners show here once your store is live.</p>;
  }
  if (!hasAddress) {
    return <p className="text-[14px]" style={{ color: theme.muted }}>Choose your state and area to see delivery options.</p>;
  }
  if (pending) {
    return <p className="flex items-center gap-2 text-[14px]" style={{ color: theme.muted }} aria-live="polite"><Icon name="clock" size={14} /> Checking delivery options for your address…</p>;
  }
  if (!delivery) {
    return <p className="text-[14px]" style={{ color: theme.muted }}>We couldn&apos;t load delivery options. Check your address and try again.</p>;
  }
  if (!delivery.covered || delivery.options.length === 0) {
    return (
      <p id={id} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-[14px] px-4 py-3 text-[14px] leading-6" style={{ background: theme.paper, color: ERROR }}>
        <Icon name="warn" size={15} className="mt-1 shrink-0" /> {delivery.reason ?? "No delivery is available to this address yet."}
      </p>
    );
  }
  const selected = selectedOptionId && delivery.options.some((option) => option.id === selectedOptionId) ? selectedOptionId : delivery.options[0]!.id;
  const main = delivery.options.filter((option) => option.kind !== "pickup_point");
  const points = sortPointsByDistance(delivery.options.filter((option) => option.kind === "pickup_point"));
  // A partner option offers pay on delivery only when the seller has pay on delivery switched on too.
  const withPod = <T extends Pick<MarketOption, "pod">>(option: T): T => ({ ...option, pod: payOnDelivery && option.pod });
  const card = (option: MarketOption) => <OptionCard key={option.id} theme={theme} option={option} pod={payOnDelivery && option.pod} name={name} checked={selected === option.id} onSelect={() => onSelect(option.id)} currency={currency} />;
  const podOffered = payOnDeliveryOffered(delivery.options.map(withPod), storePayOnDelivery);
  return (
    <div className="grid gap-2.5" id={id} tabIndex={-1}>
      {area ? <p className="m-0 text-[14px] font-semibold">To {area}</p> : null}
      {delivery.reason ? <p className="m-0 text-[13.5px]" style={{ color: theme.muted }}>{delivery.reason}</p> : null}
      {main.map(card)}
      {points.length ? <PickupPointCard theme={theme} points={points.map(withPod)} name={name} selectedOptionId={selected} onSelect={onSelect} currency={currency} /> : null}
      {podOffered ? null : <p className="m-0 text-[13px]" style={{ color: theme.muted }}>Pay on delivery isn&apos;t offered for this order.</p>}
    </div>
  );
}

/** Pickup points nearest first when the distance is known (the rest keep their order, after). */
export function sortPointsByDistance<T extends Pick<MarketOption, "distanceKm">>(points: T[]): T[] {
  return points
    .map((point, index) => ({ point, index }))
    .sort((a, b) => (a.point.distanceKm ?? Infinity) - (b.point.distanceKm ?? Infinity) || a.index - b.index)
    .map(({ point }) => point);
}

/**
 * Whether any option lets the customer pay on delivery: a partner option when it allows it, pickup from the seller
 * or the seller's own delivery when the store's rules do (unknown counts as yes, so the line never shows wrongly).
 */
export function payOnDeliveryOffered(options: Array<Pick<MarketOption, "kind" | "pod">>, storePayOnDelivery?: boolean) {
  return options.some((option) => (isPartnerOption(option) ? option.pod : storePayOnDelivery !== false));
}

const kmText = (km: number | null | undefined) => (typeof km === "number" && Number.isFinite(km) ? `${km} km` : null);

/**
 * All the pickup points as one choice: the chosen point (or the nearest) with its distance, address and hours, and
 * "Change pickup point", which opens a sheet listing every point (name · distance, address, hours).
 */
function PickupPointCard({ theme, points, name, selectedOptionId, onSelect, currency }: { theme: ShopperTheme; points: MarketOption[]; name: string; selectedOptionId: string; onSelect: (id: string) => void; currency: string }) {
  const [open, setOpen] = useState(false);
  const chosen = points.find((point) => point.id === selectedOptionId) ?? null;
  const shown = chosen ?? points[0]!;
  const checked = Boolean(chosen);
  const point = shown.point;
  const distance = kmText(shown.distanceKm);
  return (
    <div className="grid gap-2 rounded-[16px] border-2 px-4 py-3" style={{ borderColor: checked ? theme.ink : theme.border, background: theme.surface }}>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="radio" name={name} checked={checked} onChange={() => onSelect(shown.id)} className="mt-0.5 h-5 w-5 shrink-0" style={{ accentColor: theme.ink }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Pickup point</span>
          <span className="block text-[13px] leading-5" style={{ color: theme.muted }}>
            {[point?.name ?? shown.name, distance ? `${distance} away` : null, shown.estimatedDays].filter(Boolean).join(" · ")}
          </span>
          {point?.address ? <span className="block text-[13px] leading-5" style={{ color: theme.muted }}>{point.address}</span> : null}
          {point?.hours ? <span className="block text-[13px] leading-5" style={{ color: theme.muted }}>Open {point.hours}</span> : null}
          {shown.pod ? (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: theme.paper, color: theme.ink }}>
              <Icon name="check" size={11} /> Pay on delivery available
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[14.5px] font-semibold tabular-nums">{shown.price > 0 ? formatStoreMoney(shown.price, currency) : "Free"}</span>
      </label>
      {points.length > 1 ? (
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="justify-self-start py-1 text-[14px] font-semibold underline underline-offset-4">
          Change pickup point
        </button>
      ) : null}
      {open ? (
        <PointSheet
          theme={theme}
          points={points}
          selectedOptionId={selectedOptionId}
          currency={currency}
          onPick={(id) => {
            onSelect(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function PointSheet({ theme, points, selectedOptionId, currency, onPick, onClose }: { theme: ShopperTheme; points: MarketOption[]; selectedOptionId: string; currency: string; onPick: (id: string) => void; onClose: () => void }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  // Focus moves into the sheet (the chosen point) and back to "Change pickup point" after; Escape closes it.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full cursor-default" style={{ background: "rgba(0,0,0,0.4)" }} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative max-h-[85vh] w-full max-w-[520px] overflow-y-auto rounded-t-[24px] p-5 sm:rounded-[24px]" style={{ background: theme.surface, color: theme.ink }}>
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>Pickup points near you</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full" style={{ background: theme.paper }}><Icon name="x" size={16} /></button>
        </div>
        <ul className="m-0 mt-4 grid list-none gap-2.5 p-0">
          {points.map((option, index) => {
            const on = option.id === selectedOptionId;
            const distance = kmText(option.distanceKm);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(option.id)}
                  {...(on || (index === 0 && !points.some((entry) => entry.id === selectedOptionId)) ? { "data-autofocus": "" } : {})}
                  className="flex w-full items-start gap-3 rounded-[16px] border-2 px-4 py-3 text-left"
                  style={{ borderColor: on ? theme.ink : theme.border, background: theme.surface, color: theme.ink }}
                >
                  <Icon name="pin" size={16} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{[option.point?.name ?? option.name, distance].filter(Boolean).join(" · ")}</span>
                    {option.point?.address ? <span className="block text-[13px] leading-5" style={{ color: theme.muted }}>{option.point.address}</span> : null}
                    {option.point?.hours ? <span className="block text-[13px] leading-5" style={{ color: theme.muted }}>Open {option.point.hours}</span> : null}
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums">{option.price > 0 ? formatStoreMoney(option.price, currency) : "Free"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function OptionCard({ theme, option, pod, name, checked, onSelect, currency }: { theme: ShopperTheme; option: MarketOption; pod: boolean; name: string; checked: boolean; onSelect: () => void; currency: string }) {
  const point = option.kind === "pickup_point" ? option.point : undefined;
  const title = point ? point.name : option.name;
  // Pickup points: the address (and the partner, when the seller shows it); the opening hours on their own line.
  const lines = [option.detail, point?.hours ? `Open ${point.hours}` : null, option.estimatedDays ? `${option.pickup ? "Ready in" : "Arrives in"} ${option.estimatedDays}` : null].filter(Boolean) as string[];
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-3 rounded-[16px] border-2 px-4 py-3 transition-colors" style={{ borderColor: checked ? theme.ink : theme.border, background: theme.surface }}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 h-5 w-5 shrink-0" style={{ accentColor: theme.ink }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        {lines.map((line, index) => (
          <span key={index} className="block text-[13px] leading-5" style={{ color: theme.muted }}>{line}</span>
        ))}
        {pod ? (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: theme.paper, color: theme.ink }}>
            <Icon name="check" size={11} /> Pay on delivery available
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[14.5px] font-semibold tabular-nums">{option.price > 0 ? formatStoreMoney(option.price, currency) : "Free"}</span>
    </label>
  );
}
