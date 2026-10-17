"use client";

// The builder's preview of the checkout page: the real checkout UI (same frame, form sections and order summary as
// the live checkout) in the layout and with the blocks the seller is editing, filled with the store's own products as
// a sample bag. Nothing in it can be clicked or typed into: clicks reach the builder, which selects the section.

import { useMemo } from "react";
import { DEFAULT_CHECKOUT_SETTINGS, CHECKOUT_STEP_LABELS, orderTotals, type CheckoutDetails, type DeliveryChoice } from "@shared/cart-checkout";
import { checkoutPaymentOptions } from "@shared/checkout-payments";
import { readShopperInfo } from "@/lib/storefront/shopper-info";
import { countryName, regionsFor, COUNTRY_NAMES } from "@/components/storefront/shopper/checkout-storage";
import { Panel, PrimaryButton, ShopperShell } from "@/components/storefront/shopper/ShopperShell";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import { Icon } from "@/components/ui/Icon";
import {
  CheckoutFrame,
  CheckoutMessage,
  CodeForm,
  ContactFields,
  DeliveryFields,
  FormSection,
  OrderSummary,
  PaymentFields,
  StepProgress,
  TextAreaField,
} from "./CheckoutParts";
import {
  LAYOUT_STEP_TITLES,
  checkoutTrustBadges,
  continueLabel,
  deliveryEstimateText,
  placeOrderLabel,
  previewBag,
  previewPaymentMethods,
  secureCheckoutText,
  showsHeaderNav,
  stepsFor,
  summaryBlockMissing,
  whatsappHelpHref,
  type CheckoutPageSettings,
  type SummaryBlockContext,
} from "./checkout-layout";

export interface CheckoutPreviewStore {
  name: string;
  logoUrl?: string | null;
  country?: string | null;
  currency: string;
  brandSettings?: unknown;
  shopper?: unknown;
  storeProducts: ReadonlyArray<{ id: string; name: string; images?: string[] | null; retailPrice?: number | null }>;
}

const noop = () => undefined;

export function CheckoutPreview({ theme, settings, store, nav, device = "desktop" }: { theme: ShopperTheme; settings: CheckoutPageSettings; store: CheckoutPreviewStore; nav: Array<{ key: string; label: string }>; device?: "desktop" | "mobile" }) {
  const info = useMemo(() => readShopperInfo(store.shopper), [store.shopper]);
  const bag = useMemo(() => previewBag(store.storeProducts), [store.storeProducts]);
  const country = countryName(store.country);
  const details: CheckoutDetails = { name: "", email: "", phone: "", street: "", city: "", state: "", country, landmark: "" };
  const regions = regionsFor(country);
  const subtotal = bag.lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const totals = orderTotals({ subtotal, shippingFee: 0 });
  const hasZones = info.delivery.length > 0;
  const choice: DeliveryChoice = hasZones
    ? { covered: true, options: [] }
    : { covered: true, options: [{ id: "flat", name: "Delivery", price: Math.max(0, info.flatRate ?? 0), estimatedDays: null, pickup: false }] };
  const paymentOptions = checkoutPaymentOptions({ methods: previewPaymentMethods(info), paystackReady: true, opayReady: true, transferReady: true, codLimit: null, zones: [] });
  const method = paymentOptions[0]!.key;
  // Checkout settings (discount codes, notes, trust badges) aren't loaded in the builder: shown as on, the default.
  const checkout = DEFAULT_CHECKOUT_SETTINGS;
  const steps = stepsFor(settings.layout);
  const stepped = steps.length > 0;
  const minimal = settings.layout === "minimal";

  const data = {
    trustBadges: checkoutTrustBadges(info, store.currency),
    deliveryEstimate: deliveryEstimateText(info),
    secureText: secureCheckoutText(info.paymentLabels),
    // The policy pages aren't loaded in the builder; the link shows on the live store when the policy is published.
    returnsHref: "#",
    whatsappHref: whatsappHelpHref(info.whatsappNumber, store.name),
  };
  const context: SummaryBlockContext = {
    coupon: checkout.enableCoupon,
    trustEnabled: checkout.enableTrustBadges,
    trustCount: data.trustBadges.length,
    deliveryEstimate: data.deliveryEstimate,
    whatsapp: Boolean(data.whatsappHref),
    returns: true,
  };
  const blocks = settings.summaryBlocks.filter((block) => summaryBlockMissing(block, context) === null);
  const hints = settings.summaryBlocks.flatMap((block) => {
    const text = summaryBlockMissing(block, context);
    return text ? [{ block, text }] : [];
  });

  const summary = (
    <OrderSummary
      theme={theme}
      currency={store.currency}
      title={settings.labels.summary}
      lines={bag.lines}
      totals={totals}
      deliveryKnown={!hasZones}
      deliveryCovered
      deliveryPending={stepped ? "Next step" : "Add your address"}
      discountLabel="Discount"
      coupon={<CodeForm theme={theme} value="" onChange={noop} applied={null} error="" busy={false} onApply={noop} onRemove={noop} />}
      blocks={blocks}
      thumbnails={settings.thumbnails}
      data={data}
      editHref={null}
      hints={hints}
      sampleNote={bag.sample ? "Sample bag: add products to see your own here." : undefined}
    />
  );

  const errors = {};
  const contact = <ContactFields theme={theme} details={details} errors={errors} set={noop} requirePhone={checkout.requirePhone} />;
  const delivery = (
    <DeliveryFields
      theme={theme}
      details={details}
      errors={errors}
      set={noop}
      onCountry={noop}
      regions={regions}
      countries={COUNTRY_NAMES.includes(country) ? COUNTRY_NAMES : [country, ...COUNTRY_NAMES]}
      areaSuggestions={[]}
      hasZones={hasZones}
      choice={choice}
      selectedOptionId={choice.options[0]?.id ?? null}
      onSelectOption={noop}
      currency={store.currency}
      saveOnDevice={true}
    />
  );
  const payment = <PaymentFields theme={theme} options={paymentOptions} method={method} onSelect={noop} errors={errors} riderPhone={null} total={totals.total} currency={store.currency} />;
  const note = settings.orderNote && checkout.enableNotes ? <TextAreaField theme={theme} id="co-notes" label="Order note (optional)" value="" onChange={noop} hint="Anything the store should know, like a good time to deliver." /> : null;
  const final = placeOrderLabel(settings, { paystack: method === "paystack", total: totals.total, currency: store.currency });
  const actions = (
    <div className="mt-6 flex flex-col-reverse gap-3 @2xl:flex-row @2xl:items-center">
      {stepped ? null : !minimal ? <span className="inline-flex min-h-11 items-center justify-center text-[14px] font-medium underline underline-offset-4">Back to bag</span> : null}
      <div className={minimal && !stepped ? "w-full" : "@2xl:ml-auto @2xl:min-w-[260px]"}>
        <PrimaryButton theme={theme} type="button" tabIndex={-1} className="w-full">
          {stepped ? <>{continueLabel(settings, steps[1])} <Icon name="arrow" size={15} /></> : <>{method === "paystack" ? <Icon name="lock" size={16} /> : null} {final}</>}
        </PrimaryButton>
      </div>
    </div>
  );

  const body = stepped ? (
    <>
      <StepProgress theme={theme} steps={steps.map((entry) => ({ id: entry, label: CHECKOUT_STEP_LABELS[entry] }))} current={0} reached={0} onSelect={noop} />
      <CheckoutMessage theme={theme} text={settings.message} />
      <Panel theme={theme} className="p-5 sm:p-6">
        <h1 className="mb-1 text-[22px] font-semibold" style={{ fontFamily: theme.heading }}>{LAYOUT_STEP_TITLES.contact.title}</h1>
        <p className="mb-5 text-[14px]" style={{ color: theme.muted }}>{LAYOUT_STEP_TITLES.contact.sub}</p>
        {contact}
        {actions}
      </Panel>
      <p className="mt-3 text-center text-[12.5px]" style={{ color: theme.muted }}>Then: {steps.slice(1).map((entry) => CHECKOUT_STEP_LABELS[entry]).join(", then ")}. {settings.labels.placeOrder ? `The last step's button reads "${final}".` : ""}</p>
    </>
  ) : (
    <>
      <h1 className={`mb-4 text-[26px] font-semibold leading-tight ${minimal ? "text-center" : ""}`} style={{ fontFamily: theme.heading }}>Checkout</h1>
      <CheckoutMessage theme={theme} text={settings.message} />
      <div className={`grid ${minimal ? "gap-6" : "gap-5"}`}>
        <FormSection theme={theme} flat={minimal} id="cop-contact" title={CHECKOUT_STEP_LABELS.contact} sub="No account needed. We'll send your receipt and order updates here.">{contact}</FormSection>
        <FormSection theme={theme} flat={minimal} id="cop-delivery" title={CHECKOUT_STEP_LABELS.delivery} sub="Your address and how you'd like to get your order.">{delivery}</FormSection>
        <FormSection theme={theme} flat={minimal} id="cop-payment" title={CHECKOUT_STEP_LABELS.payment} sub="These are the ways this store accepts.">{payment}</FormSection>
        {note ? <FormSection theme={theme} flat={minimal} id="cop-extras" title="Anything else?">{note}</FormSection> : null}
      </div>
      {actions}
    </>
  );

  return (
    <div data-checkout-preview="" className="relative w-full">
      {/* The whole checkout is drawn but inert: the builder selects the section on click. */}
      <div inert aria-hidden className="pointer-events-none select-none" style={{ minHeight: device === "mobile" ? 720 : 760 }}>
        <ShopperShell
          theme={theme}
          storeName={store.name}
          logoUrl={store.logoUrl}
          brandSettings={store.brandSettings}
          basePath=""
          title="Checkout"
          footPayments={false}
          nav={showsHeaderNav(settings) ? nav.map((link) => ({ ...link, href: "#" })) : undefined}
          centered={minimal}
        >
          <CheckoutFrame theme={theme} settings={settings} summary={summary} summaryOpen onToggleSummary={noop} total={totals.total} currency={store.currency}>
            {body}
          </CheckoutFrame>
        </ShopperShell>
      </div>
      <span className="pointer-events-none absolute right-3 top-3 z-40 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold" style={{ background: theme.ink, color: theme.paper }}>
        <Icon name="eye" size={12} /> Checkout preview
      </span>
    </div>
  );
}
