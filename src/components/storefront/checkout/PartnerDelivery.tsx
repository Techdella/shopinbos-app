"use client";

// Delivery options from the seller's delivery partners (Logistics marketplace, shared/delivery-market.ts), as the
// checkout quote API returns them when the seller switched checkout to delivery partners. Only the server can work
// them out (rate cards, coverage, pickup points), so the bag, checkout and payment-link pages show these instead of
// the store's zones. Also: which ways to pay go with the chosen option (pay on delivery is agreed per partner).

import { Icon } from "@/components/ui/Icon";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import type { MarketOption } from "@shared/delivery-market";
import { checkoutPaymentOptions, type CheckoutPaymentContext, type CheckoutPaymentOption, type CheckoutPaymentSettings } from "@shared/checkout-payments";

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

const POD_OPTION = checkoutPaymentOptions({ methods: { cod: true }, paystackReady: false, korapayReady: false, transferReady: false, codLimit: null, zones: [] })[0]!;

/**
 * The ways to pay with delivery partners, as the checkout API accepts them: with a partner option, pay on delivery
 * only when that option allows it (the shop and the partner both opted in); with pickup from the seller or the
 * seller's fallback delivery, the store's own pay-on-delivery rules. No option yet: no pay on delivery.
 */
export function partnerPaymentOptions(settings: CheckoutPaymentSettings, context: CheckoutPaymentContext, option: Pick<MarketOption, "kind" | "pod"> | null): CheckoutPaymentOption[] {
  const store = checkoutPaymentOptions(settings, context);
  if (option && !isPartnerOption(option)) return store;
  const rest = store.filter((entry) => entry.key !== "pay_on_delivery");
  return option?.pod ? [...rest, POD_OPTION] : rest;
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
  name = "deliveryOption",
  id = "co-deliveryOption",
}: {
  theme: ShopperTheme;
  delivery: QuotedDelivery | null;
  pending: boolean;
  hasAddress: boolean;
  selectedOptionId: string | null;
  onSelect: (id: string) => void;
  currency: string;
  /** Owner preview: nothing is quoted, so say where the options will come from. */
  preview?: boolean;
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
  const points = delivery.options.filter((option) => option.kind === "pickup_point");
  const card = (option: MarketOption) => <OptionCard key={option.id} theme={theme} option={option} name={name} checked={selected === option.id} onSelect={() => onSelect(option.id)} currency={currency} />;
  return (
    <div className="grid gap-2.5" id={id} tabIndex={-1}>
      {delivery.reason ? <p className="m-0 text-[13.5px]" style={{ color: theme.muted }}>{delivery.reason}</p> : null}
      {main.map(card)}
      {points.length ? (
        <div className="mt-1 grid gap-2.5">
          <h3 className="m-0 flex items-center gap-2 text-[14px] font-semibold"><Icon name="pin" size={15} /> Pickup point</h3>
          <p className="m-0 text-[13px]" style={{ color: theme.muted }}>Collect your order from a pickup point near you.</p>
          {points.map(card)}
        </div>
      ) : null}
    </div>
  );
}

function OptionCard({ theme, option, name, checked, onSelect, currency }: { theme: ShopperTheme; option: MarketOption; name: string; checked: boolean; onSelect: () => void; currency: string }) {
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
        {option.pod ? (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: theme.paper, color: theme.ink }}>
            <Icon name="check" size={11} /> Pay on delivery available
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[14.5px] font-semibold tabular-nums">{option.price > 0 ? formatStoreMoney(option.price, currency) : "Free"}</span>
    </label>
  );
}
