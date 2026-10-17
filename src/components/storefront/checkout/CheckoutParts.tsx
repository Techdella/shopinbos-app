"use client";

// The checkout's building blocks, shared by the live checkout (CheckoutClient) and the builder's preview of it
// (CheckoutPreview): the page frame for each layout, the form sections, the order summary and its blocks, the step
// progress and the fields. Presentational only: state and pricing stay with the caller.

import Link from "next/link";
import { useId } from "react";
import type React from "react";
import { Icon } from "@/components/ui/Icon";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { lineKey, type CartLine, type CheckoutDetails, type DeliveryChoice, type DeliveryOption, type FieldErrors, type OrderTotals } from "@shared/cart-checkout";
import type { CheckoutPaymentMethod, CheckoutPaymentOption } from "@shared/checkout-payments";
import type { AppliedCode } from "@/components/storefront/shopper/checkout-storage";
import { ItemThumb, Money, Panel, SecondaryButton, fieldClass } from "@/components/storefront/shopper/ShopperShell";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import { hasSideSummary, splitSummaryBlocks, stepProgress, type CheckoutPageSettings, type CheckoutSummaryBlock, type CheckoutTrustBadge } from "./checkout-layout";

const ERROR = "#B42318";

// ─── Page frame ───────────────────────────────────────────────────────────────

/**
 * Arranges the checkout for the chosen layout. Container queries (not the window), so the builder's phone preview
 * lays out like a real phone. Every layout folds the summary into a bar with the total on narrow screens; One page
 * and Minimal keep that bar at the top on every screen.
 */
export function CheckoutFrame({
  theme,
  settings,
  summary,
  summaryOpen,
  onToggleSummary,
  total,
  currency,
  children,
}: {
  theme: ShopperTheme;
  settings: Pick<CheckoutPageSettings, "layout" | "summaryPosition" | "labels">;
  summary: React.ReactNode;
  summaryOpen: boolean;
  onToggleSummary: () => void;
  total: number;
  currency: string;
  children: React.ReactNode;
}) {
  const panelId = useId();
  const side = hasSideSummary(settings.layout);
  const left = settings.summaryPosition === "left";
  const bar = (
    <div className={side ? "mb-5 @4xl:hidden" : "mb-5"}>
      <button
        type="button"
        onClick={onToggleSummary}
        aria-expanded={summaryOpen}
        aria-controls={panelId}
        className="flex min-h-12 w-full items-center justify-between gap-3 border px-4 text-[15px] font-medium focus-visible:outline focus-visible:outline-2"
        style={{ borderColor: theme.border, background: theme.surface, borderRadius: Math.min(theme.radius, 16) }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon name="bag" size={16} /> <span className="truncate">{summaryOpen ? "Hide" : "Show"} {settings.labels.summary.toLowerCase()}</span>
          <Icon name="chevDown" size={14} className={summaryOpen ? "rotate-180" : ""} />
        </span>
        <span className="shrink-0 font-semibold tabular-nums"><Money amount={total} currency={currency} /></span>
      </button>
      {summaryOpen ? <div id={panelId} className="mt-3">{summary}</div> : null}
    </div>
  );

  if (!side) {
    return (
      <div className="@container w-full" data-checkout-layout={settings.layout}>
        <div className={`mx-auto w-full min-w-0 ${settings.layout === "minimal" ? "max-w-[560px]" : "max-w-[760px]"}`}>
          {bar}
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="@container w-full" data-checkout-layout={settings.layout}>
      <div className={`grid items-start gap-6 @4xl:gap-12 ${left ? "@4xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]" : "@4xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]"}`}>
        <div className={`min-w-0 ${left ? "@4xl:order-2" : ""}`}>
          {bar}
          {children}
        </div>
        <aside className={`hidden @4xl:sticky @4xl:top-24 @4xl:block ${left ? "@4xl:order-1" : ""}`} aria-label={settings.labels.summary}>{summary}</aside>
      </div>
    </div>
  );
}

/** A form section: a card on most layouts, a plain block with a rule above it on Minimal. */
export function FormSection({ theme, flat, title, sub, id, children }: { theme: ShopperTheme; flat?: boolean; title: string; sub?: string; id: string; children: React.ReactNode }) {
  const heading = (
    <>
      <h2 id={id} className="text-[19px] font-semibold" style={{ fontFamily: theme.heading }}>{title}</h2>
      {sub ? <p className="mb-4 mt-1 text-[14px]" style={{ color: theme.muted }}>{sub}</p> : <div className="mb-4" />}
    </>
  );
  if (flat) {
    return (
      <section aria-labelledby={id} className="border-t pt-6 first:border-t-0 first:pt-0" style={{ borderColor: theme.border }}>
        {heading}
        {children}
      </section>
    );
  }
  return (
    <Panel theme={theme} className="p-5 sm:p-6" aria-labelledby={id}>
      {heading}
      {children}
    </Panel>
  );
}

export function CheckoutMessage({ theme, text }: { theme: ShopperTheme; text: string }) {
  if (!text) return null;
  return (
    <p className="mb-5 flex items-start gap-2.5 border px-4 py-3 text-[14.5px] leading-6" style={{ borderColor: theme.border, background: theme.surface, borderRadius: Math.min(theme.radius, 16) }}>
      <Icon name="info" size={16} className="mt-1 shrink-0" />
      <span className="whitespace-pre-line">{text}</span>
    </p>
  );
}

/** Announced summary of what's wrong after a submit (the fields show their own messages too). */
export function ErrorSummary({ text }: { text: string }) {
  return (
    <div role="alert" aria-live="assertive" className={text ? "mb-5 flex items-start gap-2.5 rounded-[16px] border px-4 py-3 text-[14.5px] leading-6" : "sr-only"} style={text ? { background: "#FDECEA", color: "#8A1C12", borderColor: "#F5C2BC" } : undefined}>
      {text ? <><Icon name="warn" size={17} className="mt-0.5 shrink-0" /><span>{text}</span></> : null}
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

export function StepProgress({ theme, steps, current, reached, onSelect }: { theme: ShopperTheme; steps: Array<{ id: string; label: string }>; current: number; reached: number; onSelect: (index: number) => void }) {
  const percent = stepProgress(current, steps.length);
  return (
    <nav aria-label="Checkout progress" className="mb-5">
      <p className="mb-2 text-[13px] font-medium @2xl:hidden" style={{ color: theme.muted }}>
        Step {current + 1} of {steps.length}: {steps[current]?.label}
      </p>
      <div
        className="mb-3 h-1.5 overflow-hidden rounded-full @2xl:hidden"
        style={{ background: theme.border }}
        role="progressbar"
        aria-label="Checkout progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${percent}%`, background: theme.cta }} />
      </div>
      <ol className="m-0 hidden list-none gap-2 p-0 @2xl:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((entry, index) => {
          const done = index < current;
          const active = index === current;
          const reachable = index <= reached && !active;
          return (
            <li key={entry.id} className="min-w-0">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(index)}
                aria-current={active ? "step" : undefined}
                className="flex w-full min-w-0 flex-col gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-default"
              >
                <span className="h-1.5 w-full rounded-full transition-colors" style={{ background: index <= current ? theme.cta : theme.border }} />
                <span className="flex items-center gap-1.5 truncate text-[13.5px]" style={{ color: active || done ? theme.ink : theme.muted, fontWeight: active ? 700 : 500 }}>
                  {done ? <Icon name="check" size={13} /> : <span className="tabular-nums">{index + 1}.</span>}
                  {entry.label}
                  {done ? <span className="sr-only"> (done)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Form sections ────────────────────────────────────────────────────────────

type SetField = <K extends keyof CheckoutDetails>(field: K, value: CheckoutDetails[K]) => void;

export function ContactFields({ theme, details, errors, set, requirePhone }: { theme: ShopperTheme; details: CheckoutDetails; errors: FieldErrors; set: SetField; requirePhone: boolean }) {
  return (
    <div className="grid gap-4 @2xl:grid-cols-2">
      <TextField theme={theme} id="co-name" label="Full name" value={details.name} onChange={(v) => set("name", v)} error={errors.name} autoComplete="name" className="@2xl:col-span-2" />
      <TextField theme={theme} id="co-email" label="Email" type="email" inputMode="email" value={details.email} onChange={(v) => set("email", v)} error={errors.email} autoComplete="email" />
      <TextField theme={theme} id="co-phone" label={requirePhone ? "Phone number" : "Phone number (optional)"} type="tel" inputMode="tel" value={details.phone} onChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" hint="For delivery updates from the store or rider." />
    </div>
  );
}

export function DeliveryFields({
  theme,
  details,
  errors,
  set,
  onCountry,
  regions,
  countries,
  areaSuggestions,
  hasZones,
  choice,
  selectedOptionId,
  onSelectOption,
  currency,
  saveOnDevice,
  onSaveOnDevice,
}: {
  theme: ShopperTheme;
  details: CheckoutDetails;
  errors: FieldErrors;
  set: SetField;
  onCountry: (country: string) => void;
  regions: string[];
  countries: string[];
  areaSuggestions: string[];
  hasZones: boolean;
  choice: DeliveryChoice;
  selectedOptionId: string | null;
  onSelectOption: (id: string) => void;
  currency: string;
  /** Null hides the "save my details" box (builder preview). */
  saveOnDevice: boolean | null;
  onSaveOnDevice?: (on: boolean) => void;
}) {
  return (
    <div className="grid gap-4">
      <TextField theme={theme} id="co-street" label="Street address" value={details.street} onChange={(v) => set("street", v)} error={errors.street} autoComplete="street-address" hint="House number, street and estate." />
      <div className="grid gap-4 @2xl:grid-cols-2">
        {regions.length ? (
          <SelectField theme={theme} id="co-state" label="State" value={details.state} onChange={(v) => set("state", v)} error={errors.state} autoComplete="address-level1" options={regions} placeholder="Choose your state" />
        ) : (
          <TextField theme={theme} id="co-state" label="State or region (optional)" value={details.state} onChange={(v) => set("state", v)} error={errors.state} autoComplete="address-level1" />
        )}
        <TextField theme={theme} id="co-city" label="Area or city" value={details.city} onChange={(v) => set("city", v)} error={errors.city} autoComplete="address-level2" list="co-areas" hint="For example Lekki, Ikeja or Wuse." />
        <datalist id="co-areas">
          {areaSuggestions.map((region) => <option key={region} value={region} />)}
        </datalist>
        <TextField theme={theme} id="co-landmark" label="Nearest landmark (optional)" value={details.landmark} onChange={(v) => set("landmark", v)} autoComplete="off" hint="Helps the rider find you." />
        <SelectField theme={theme} id="co-country" label="Country" value={details.country} onChange={onCountry} autoComplete="country-name" options={countries} />
      </div>

      <fieldset className="m-0 mt-1 min-w-0 border-0 p-0">
        <legend className="mb-2 p-0 text-[15px] font-semibold">Delivery option</legend>
        {!details.city && !details.state && hasZones ? (
          <p className="text-[14px]" style={{ color: theme.muted }}>Enter your state and area to see delivery options.</p>
        ) : !choice.covered ? (
          <p className="rounded-[14px] px-4 py-3 text-[14px]" style={{ background: theme.paper }}>
            The store hasn&apos;t set a delivery fee for this area. You can still order and they&apos;ll contact you to arrange delivery.
          </p>
        ) : choice.options.length === 0 ? (
          <p className="text-[14px]" style={{ color: theme.muted }}>Delivery to this area is free.</p>
        ) : (
          <div className="grid gap-2.5" id="co-deliveryOption" tabIndex={-1}>
            {choice.options.map((option: DeliveryOption) => (
              <ChoiceCard
                key={option.id}
                theme={theme}
                name="deliveryOption"
                checked={(selectedOptionId ?? choice.options[0]?.id) === option.id}
                onSelect={() => onSelectOption(option.id)}
                title={option.name}
                detail={[option.estimatedDays, option.pickup ? "You collect it" : null].filter(Boolean).join(" · ") || undefined}
                aside={option.price > 0 ? formatStoreMoney(option.price, currency) : "Free"}
              />
            ))}
          </div>
        )}
        {errors.deliveryOption ? <p role="alert" className="mt-1.5 text-[13px]" style={{ color: ERROR }}>{errors.deliveryOption}</p> : null}
      </fieldset>

      {saveOnDevice !== null ? (
        <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-[14.5px]">
          <input type="checkbox" checked={saveOnDevice} onChange={(event) => onSaveOnDevice?.(event.target.checked)} className="h-5 w-5 shrink-0" style={{ accentColor: theme.cta }} />
          Save my details on this device for next time
        </label>
      ) : null}
    </div>
  );
}

export function PaymentFields({
  theme,
  options,
  method,
  onSelect,
  errors,
  riderPhone,
  total,
  currency,
}: {
  theme: ShopperTheme;
  options: CheckoutPaymentOption[];
  method: CheckoutPaymentMethod;
  onSelect: (method: CheckoutPaymentMethod) => void;
  errors: FieldErrors;
  /** The rider's phone field for pay on delivery (Steps, where the contact fields aren't on screen); null to skip it. */
  riderPhone: React.ReactNode | null;
  total: number;
  currency: string;
}) {
  return (
    <div className="grid gap-3">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Payment method</legend>
        <div className="grid gap-2.5" id="co-paymentMethod" tabIndex={-1}>
          {options.map((option) => (
            <ChoiceCard
              key={option.key}
              theme={theme}
              name="paymentMethod"
              checked={option.key === method}
              onSelect={() => onSelect(option.key)}
              title={option.label}
              detail={option.hint}
              icon={option.key === "paystack" ? "card" : option.key === "transfer" ? "bank" : "truck"}
            />
          ))}
        </div>
      </fieldset>
      {errors.paymentMethod ? <p role="alert" className="text-[13px]" style={{ color: ERROR }}>{errors.paymentMethod}</p> : null}
      {method === "pay_on_delivery" ? (
        <div className="grid gap-2">
          {riderPhone}
          <p className="text-[13px]" style={{ color: theme.muted }}>Have <Money amount={total} currency={currency} /> ready when your order arrives.</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Order summary ────────────────────────────────────────────────────────────

export interface SummaryBlockData {
  trustBadges: CheckoutTrustBadge[];
  deliveryEstimate: string | null;
  secureText: string;
  returnsHref: string | null;
  whatsappHref: string | null;
}

export function OrderSummary({
  theme,
  currency,
  title,
  lines,
  totals,
  pointsAmount = 0,
  rewards,
  extras,
  deliveryKnown,
  deliveryCovered,
  deliveryPending = "Next step",
  discountLabel,
  coupon,
  blocks,
  thumbnails,
  data,
  editHref,
  accept,
  hints,
  sampleNote,
}: {
  theme: ShopperTheme;
  currency: string;
  title: string;
  lines: CartLine[];
  totals: OrderTotals;
  /** Loyalty points' share of totals.productDiscount, shown on its own line. */
  pointsAmount?: number;
  rewards?: React.ReactNode;
  extras?: React.ReactNode;
  deliveryKnown: boolean;
  deliveryCovered: boolean;
  /** What the delivery line says before the address is known. */
  deliveryPending?: string;
  discountLabel: string;
  coupon: React.ReactNode;
  /** The blocks that show, in the seller's order. */
  blocks: CheckoutSummaryBlock[];
  thumbnails: boolean;
  data: SummaryBlockData;
  /** Null: no "Edit bag" link (builder preview). */
  editHref: string | null;
  /** "We accept" and the store's payment logos (live store only). */
  accept?: React.ReactNode;
  /** Builder only: blocks the seller turned on that can't show yet, and why. */
  hints?: Array<{ block: CheckoutSummaryBlock; text: string }>;
  /** Builder only: the bag is made-up sample items. */
  sampleNote?: string;
}) {
  const deliveryCharge = totals.shippingFee - totals.deliveryDiscount;
  const codeDiscount = Math.max(0, Math.round((totals.productDiscount - pointsAmount) * 100) / 100);
  const { beforeTotals, afterTotals } = splitSummaryBlocks(blocks);

  const block = (id: CheckoutSummaryBlock): React.ReactNode => {
    switch (id) {
      case "items":
        return (
          <ul key={id} className="m-0 grid max-h-[320px] list-none gap-3 overflow-y-auto p-0 pt-1">
            {lines.map((line) => (
              <li key={lineKey(line)} className="flex items-center gap-3">
                {thumbnails ? (
                  <span className="relative">
                    <ItemThumb theme={theme} src={line.image} alt="" size={56} />
                    <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold" style={{ background: theme.ink, color: theme.paper }} aria-hidden>{line.quantity}</span>
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{line.name}</span>
                  <span className="block text-[12.5px]" style={{ color: theme.muted }}>{[line.variant, `Qty ${line.quantity}`].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="text-[14px] font-medium tabular-nums"><Money amount={line.price * line.quantity} currency={currency} /></span>
              </li>
            ))}
          </ul>
        );
      case "discount":
        return coupon ? <div key={id}>{coupon}</div> : null;
      case "delivery":
        return data.deliveryEstimate ? (
          <p key={id} className="m-0 flex items-center gap-2 text-[13.5px]"><Icon name="clock" size={15} className="shrink-0" /> {data.deliveryEstimate}</p>
        ) : null;
      case "trust":
        return data.trustBadges.length ? (
          <ul key={id} className="m-0 grid list-none grid-cols-1 gap-2 p-0 @md:grid-cols-2">
            {data.trustBadges.map((badge) => (
              <li key={badge.id} className="flex items-center gap-2 rounded-[12px] px-3 py-2 text-[13px] font-medium" style={{ background: theme.paper }}>
                <Icon name={badge.icon} size={15} className="shrink-0" /> {badge.title}
              </li>
            ))}
          </ul>
        ) : null;
      case "secure":
        return <p key={id} className="m-0 flex items-center gap-2 text-[13px]" style={{ color: theme.muted }}><Icon name="lock" size={14} className="shrink-0" /> {data.secureText}</p>;
      case "returns":
        return data.returnsHref ? (
          <p key={id} className="m-0 flex items-center gap-2 text-[13px]"><Icon name="refresh" size={14} className="shrink-0" /> <a href={data.returnsHref} target="_blank" rel="noopener" className="underline underline-offset-2">Returns and refunds</a></p>
        ) : null;
      case "whatsapp":
        return data.whatsappHref ? (
          <p key={id} className="m-0 flex items-center gap-2 text-[13px]"><Icon name="whatsapp" size={15} className="shrink-0" /> <a href={data.whatsappHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Questions? Chat with us on WhatsApp</a></p>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <Panel theme={theme} className="@container grid gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold" style={{ fontFamily: theme.heading }}>{title}</h2>
        {editHref ? <Link href={editHref} className="text-[13.5px] font-medium underline underline-offset-4">Edit bag</Link> : null}
      </div>
      {sampleNote ? <p className="m-0 rounded-[12px] border border-dashed px-3 py-2 text-[12.5px]" style={{ borderColor: theme.border, color: theme.muted }}>{sampleNote}</p> : null}
      {beforeTotals.map(block)}
      {rewards}
      {extras}
      <dl className="m-0 grid gap-2 border-t pt-4 text-[14.5px]" style={{ borderColor: theme.border }}>
        <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd className="m-0 tabular-nums"><Money amount={totals.subtotal} currency={currency} /></dd></div>
        {codeDiscount > 0 ? (
          <div className="flex justify-between gap-3"><dt className="min-w-0">{discountLabel}</dt><dd className="m-0 shrink-0 tabular-nums">−<Money amount={codeDiscount} currency={currency} /></dd></div>
        ) : null}
        {pointsAmount > 0 ? (
          <div className="flex justify-between gap-3"><dt className="min-w-0">Loyalty points</dt><dd className="m-0 shrink-0 tabular-nums">−<Money amount={pointsAmount} currency={currency} /></dd></div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt>Delivery</dt>
          <dd className="m-0 tabular-nums">
            {!deliveryKnown ? <span style={{ color: theme.muted }}>{deliveryPending}</span> : !deliveryCovered ? <span style={{ color: theme.muted }}>Arranged by the store</span> : deliveryCharge > 0 ? <Money amount={deliveryCharge} currency={currency} /> : totals.deliveryDiscount > 0 ? `Free (${discountLabel.toLowerCase()})` : "Free"}
          </dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-3 text-[18px] font-semibold" style={{ borderColor: theme.border }}>
          <dt>Total</dt>
          <dd className="m-0 tabular-nums"><Money amount={totals.total} currency={currency} /></dd>
        </div>
      </dl>
      {afterTotals.length ? <div className="grid gap-2.5">{afterTotals.map(block)}</div> : null}
      {hints?.length ? (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {hints.map((hint) => (
            <li key={hint.block} className="rounded-[10px] border border-dashed px-3 py-2 text-[12px] leading-5" style={{ borderColor: theme.border, color: theme.muted }}>{hint.text}</li>
          ))}
        </ul>
      ) : null}
      {accept}
    </Panel>
  );
}

export function CodeForm({ theme, value, onChange, applied, error, busy, onApply, onRemove }: { theme: ShopperTheme; value: string; onChange: (v: string) => void; applied: AppliedCode | null; error: string; busy: boolean; onApply: () => void; onRemove: () => void }) {
  const id = useId();
  if (applied) {
    return (
      <div>
        <div className="flex items-center gap-2 rounded-[14px] px-3 py-2 text-[14px]" style={{ background: theme.paper }}>
          <Icon name="tag" size={15} />
          <span className="min-w-0 flex-1"><strong>{applied.code}</strong> applied</span>
          <button type="button" onClick={onRemove} className="min-h-10 px-2 text-[13px] font-medium underline underline-offset-4">Remove</button>
        </div>
        {error ? <p role="alert" className="mt-1.5 text-[13px]" style={{ color: ERROR }}>{error}</p> : null}
      </div>
    );
  }
  // Not a <form>: on phones this sits inside the checkout form.
  return (
    <div>
      <label htmlFor={id} className="text-[13.5px] font-medium">Discount code</label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onApply(); } }}
          autoCapitalize="characters"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-full border bg-white px-4 text-[15px] uppercase outline-none focus-visible:outline focus-visible:outline-2"
          style={{ borderColor: theme.border, color: "#16141F" }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <SecondaryButton theme={theme} type="button" onClick={onApply} disabled={busy || !value.trim()}>{busy ? "Checking…" : "Apply"}</SecondaryButton>
      </div>
      {error ? <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px]" style={{ color: ERROR }}>{error}</p> : null}
    </div>
  );
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

export function ReviewBlock({ theme, title, onEdit, children }: { theme: ShopperTheme; title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] border p-4" style={{ borderColor: theme.border }}>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13.5px] font-semibold" style={{ color: theme.muted }}>{title}</h3>
        <p className="mt-1 break-words text-[15px] leading-6">{children}</p>
      </div>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="min-h-10 shrink-0 px-2 text-[14px] font-medium underline underline-offset-4" aria-label={`Change ${title.toLowerCase()}`}>
          Change
        </button>
      ) : null}
    </div>
  );
}

export function ChoiceCard({ theme, name, checked, onSelect, title, detail, aside, icon }: { theme: ShopperTheme; name: string; checked: boolean; onSelect: () => void; title: string; detail?: string; aside?: string; icon?: "card" | "bank" | "truck" }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[16px] border-2 px-4 py-3 transition-colors" style={{ borderColor: checked ? theme.ink : theme.border, background: theme.surface }}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="h-5 w-5 shrink-0" style={{ accentColor: theme.ink }} />
      {icon ? <Icon name={icon} size={18} className="shrink-0" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        {detail ? <span className="block text-[13px] leading-5" style={{ color: theme.muted }}>{detail}</span> : null}
      </span>
      {aside ? <span className="shrink-0 text-[14.5px] font-semibold tabular-nums">{aside}</span> : null}
    </label>
  );
}

function FieldShell({ id, label, error, hint, className = "", theme, children }: { id: string; label: string; error?: string; hint?: string; className?: string; theme: ShopperTheme; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-[14px] font-medium">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-[13px]" style={{ color: ERROR }}>
          <Icon name="warn" size={13} /> {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px]" style={{ color: theme.muted }}>{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  theme,
  id,
  label,
  value,
  onChange,
  error,
  hint,
  className,
  ...input
}: { theme: ShopperTheme; id: string; label: string; value: string; onChange: (value: string) => void; error?: string; hint?: string; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "id" | "className">) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className} theme={theme}>
      <input
        {...input}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={fieldClass}
        style={{ borderColor: error ? ERROR : theme.border, color: "#16141F" }}
      />
    </FieldShell>
  );
}

export function SelectField({ theme, id, label, value, onChange, error, options, placeholder, autoComplete }: { theme: ShopperTheme; id: string; label: string; value: string; onChange: (value: string) => void; error?: string; options: string[]; placeholder?: string; autoComplete?: string }) {
  return (
    <FieldShell id={id} label={label} error={error} theme={theme}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={fieldClass}
        style={{ borderColor: error ? ERROR : theme.border, color: "#16141F" }}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </FieldShell>
  );
}

export function TextAreaField({ theme, id, label, value, onChange, hint, disabled }: { theme: ShopperTheme; id: string; label: string; value: string; onChange: (value: string) => void; hint?: string; disabled?: boolean }) {
  return (
    <FieldShell id={id} label={label} hint={hint} theme={theme}>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={1000}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1.5 block w-full rounded-[14px] border bg-white px-4 py-3 text-[16px] outline-none focus-visible:outline focus-visible:outline-2"
        style={{ borderColor: theme.border, color: "#16141F" }}
      />
    </FieldShell>
  );
}
