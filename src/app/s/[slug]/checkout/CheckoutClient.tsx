"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { useStoreCheckoutStart } from "@/lib/analytics/storefront-events";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { readLinkCode, readOrderChannel, useCampaignAttribution } from "@/hooks/useCampaignAttribution";
import { readRememberedStoreVisitor, rememberStoreVisitor, useStoreVisitor } from "@/hooks/useStoreVisitor";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { checkoutLegalLinks, legalPagePath } from "@/lib/legal/pages";
import { formatStoreMoney, freeDeliveryEverywhereOver, readShopperInfo } from "@/lib/storefront/shopper-info";
import { discountAmount } from "@/lib/discounts";
import { PaystackCheckoutButton } from "@/components/payments/PaystackCheckout";
import { verifyPaystackPayment, updateOrderPayment } from "@/app/actions/payments";
import { checkoutPaymentOptions, type CheckoutPaymentMethod } from "@shared/checkout-payments";
import {
  CHECKOUT_STEPS,
  CHECKOUT_STEP_LABELS,
  chooseDelivery,
  deliveryOptionsFor,
  firstIncompleteStep,
  isEmail,
  isPhone,
  lineKey,
  orderTotals,
  stepErrors,
  suggestProducts,
  type CartLine,
  type CheckoutDetails,
  type CheckoutRules,
  type CheckoutStep,
  type FieldErrors,
  type OrderTotals,
} from "@shared/cart-checkout";
import { captureCart, readCartToken, rememberCartToken } from "@/components/storefront/shopper/cart-capture";
import {
  COUNTRY_NAMES,
  checkDiscountCode,
  countryName,
  forgetDetails,
  readBagDiscount,
  readPrefill,
  readSavedDetails,
  regionsFor,
  rememberBagDiscount,
  saveDetails,
  type AppliedCode,
} from "@/components/storefront/shopper/checkout-storage";
import { Banner, TrustLine } from "@/components/storefront/shopper/CartPage";
import { ItemThumb, Money, Panel, PrimaryButton, SecondaryButton, ShopperShell, fieldClass } from "@/components/storefront/shopper/ShopperShell";
import { readVariants } from "@/components/storefront/shopper/catalog";
import { WeAccept } from "@/components/storefront/shopper/StoreFooterBadges";
import { resolveShopperTheme, type ShopperTheme } from "@/components/storefront/shopper/theme";
import type { ShopperCommerce, ShopperStore } from "@/components/storefront/shopper/types";
import { TransferInstructions, type TransferDetails } from "../order/[orderId]/TransferInstructions";
import { readGameConfig } from "@/lib/gamification/logic";
import { RewardProgress } from "@/components/storefront/gamification/RewardProgress";
import { PointsAtCheckout, WonCodeBanner } from "@/components/storefront/gamification/Rewards";

// Multi-step checkout: Contact → Delivery → Payment → Review. Guest checkout (no account), details saved on
// this device when the shopper agrees, delivery options from the seller's zones, the seller's payment methods
// (Paystack, bank transfer, pay on delivery), totals quoted by the server, and the bag saved for reminders
// once we can reach the shopper. In the owner's preview of a store that isn't live, every step works but
// nothing is quoted by the server, saved for reminders, charged or ordered.

interface Props {
  store: ShopperStore;
  storeBasePath: string;
  commerce: ShopperCommerce;
  /** Owner preview of a store that isn't live: the full checkout UI, without payment or order creation. */
  preview?: boolean;
}

interface CreatedOrder {
  id: string;
  orderNumber: string;
  total: number;
  currency: string;
}

interface Quote {
  totals: OrderTotals;
  discount: { code: string; label: string; automatic: boolean } | null;
  codeError: string | null;
  /** Loyalty points the server took off (inside totals). */
  points?: { points: number; amount: number; balance: number; max: number } | null;
}

const EMPTY_DETAILS: CheckoutDetails = { name: "", email: "", phone: "", street: "", city: "", state: "", country: "", landmark: "" };

export function CheckoutClient({ store, storeBasePath, commerce, preview = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cart = useCart(store.slug);
  const visitorKey = useStoreVisitor(store.slug);
  const campaignToken = useCampaignAttribution(preview ? "" : store.slug);
  useStoreCheckoutStart(preview ? "" : store.slug);
  const theme = useMemo(() => resolveShopperTheme(store.brandSettings), [store.brandSettings]);
  const policies = useMemo(() => checkoutLegalLinks(store.brandSettings), [store.brandSettings]);
  const info = useMemo(() => readShopperInfo(store.shopper), [store.shopper]);
  const settings = commerce.checkout;
  const homeCountry = countryName(store.country);

  const [details, setDetails] = useState<CheckoutDetails>({ ...EMPTY_DETAILS, country: homeCountry });
  const [stepIndex, setStepIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveOnDevice, setSaveOnDevice] = useState(true);
  const [deliveryOptionId, setDeliveryOptionId] = useState<string | null>(null);
  const [chosenMethod, setChosenMethod] = useState<CheckoutPaymentMethod | null>(null);
  const [notes, setNotes] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [transfer, setTransfer] = useState<TransferDetails | null>(null);
  const [paying, setPaying] = useState(false);
  const [payClosed, setPayClosed] = useState(false);

  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<AppliedCode | null>(null);
  const [codeError, setCodeError] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [quote, setQuote] = useState<{ key: string; value: Quote } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Loyalty points the shopper chose to use (Marketing > Rewards); the server's quote decides what applies.
  const game = useMemo(() => readGameConfig((store.brandSettings as Record<string, unknown> | null | undefined)?.gamification ?? {}), [store.brandSettings]);
  const [usePoints, setUsePoints] = useState(0);

  const step: CheckoutStep = CHECKOUT_STEPS[stepIndex]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const regions = useMemo(() => regionsFor(details.country), [details.country]);

  // ─── Money (estimate first, then the server's quote for the same inputs) ───
  const address = { city: details.city, state: details.state };
  const deliveryChoice = deliveryOptionsFor(commerce.zones, commerce.flatRate, address, cart.subtotal);
  const delivery = chooseDelivery(deliveryChoice, deliveryOptionId);
  const code = settings.enableCoupon ? applied : null;
  const estimate = orderTotals({
    subtotal: cart.subtotal,
    shippingFee: delivery.fee,
    discount: code ? { type: code.type, amount: discountAmount(code, cart.items, delivery.fee) } : null,
  });
  const quoteKey = JSON.stringify([cart.items.map((line) => [line.productId, line.variant ?? "", line.quantity]), details.city, details.state, delivery.option?.id ?? null, code?.code ?? "", isEmail(details.email) ? details.email.trim().toLowerCase() : "", usePoints, usePoints ? details.phone.trim() : ""]);
  const liveQuote = quote && quote.key === quoteKey ? quote.value : null;
  const totals = liveQuote?.totals ?? estimate;

  const paymentOptions = useMemo(
    () => checkoutPaymentOptions(commerce.payments, { city: details.city, state: details.state, total: totals.total }),
    [commerce.payments, details.city, details.state, totals.total],
  );
  // Keep the shopper's pick while it is still on offer (an address or total change can rule pay on delivery out).
  const paymentMethod: CheckoutPaymentMethod = paymentOptions.some((option) => option.key === chosenMethod) ? chosenMethod! : paymentOptions[0]!.key;
  const isPaystack = paymentMethod === "paystack";

  const rules: CheckoutRules = {
    requirePhone: settings.requirePhone,
    requireState: regions.length > 0,
    deliveryOptionIds: deliveryChoice.options.map((option) => option.id),
    paymentMethods: paymentOptions.map((option) => option.key),
  };
  const choice = { deliveryOptionId: delivery.option?.id ?? null, paymentMethod };

  // ─── Start: saved details, reminder-link contact, remembered visitor ───────
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !cart.loaded) return;
    started.current = true;
    const saved = readSavedDetails(store.slug);
    const prefill = readPrefill(store.slug);
    const remembered = readRememberedStoreVisitor(store.slug);
    const next: CheckoutDetails = {
      ...EMPTY_DETAILS,
      country: homeCountry,
      ...saved,
      ...Object.fromEntries(Object.entries(prefill).filter(([, value]) => value)),
    };
    if (!next.email && remembered.email) next.email = remembered.email;
    if (!next.name && remembered.name) next.name = remembered.name;
    setDetails(next);
    const savedCode = readBagDiscount(store.slug);
    if (savedCode && settings.enableCoupon) void applyCode(savedCode, true);
    // A returning shopper with their details saved starts at the first step that still needs something.
    if (Object.keys(saved).length > 0 && searchParams.get("step") !== "contact") {
      const nextRegions = regionsFor(next.country);
      const nextChoice = deliveryOptionsFor(commerce.zones, commerce.flatRate, next, cart.subtotal);
      const target = firstIncompleteStep(next, { ...rules, requireState: nextRegions.length > 0, deliveryOptionIds: nextChoice.options.map((option) => option.id) }, {
        deliveryOptionId: nextChoice.options[0]?.id ?? null,
        paymentMethod: paymentOptions[0]?.key,
      });
      const start = Math.min(CHECKOUT_STEPS.indexOf(target), CHECKOUT_STEPS.indexOf("payment"));
      setStepIndex(start);
      setReached(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.loaded]);

  // ─── Server quote once the address is known ────────────────────────────────
  useEffect(() => {
    if (preview || !cart.loaded || cart.items.length === 0 || createdOrder || stepIndex < 1) return;
    if (commerce.zones.length > 0 && !details.city && !details.state) return;
    const key = quoteKey;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/public/store/${encodeURIComponent(store.slug)}/checkout/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          items: cart.items.map((line) => ({ productId: line.productId, quantity: line.quantity, variant: line.variant })),
          address: { city: details.city, state: details.state },
          deliveryOptionId: delivery.option?.id,
          discountCode: code?.code,
          buyerEmail: isEmail(details.email) ? details.email.trim() : undefined,
          ...(usePoints > 0 ? { redeemPoints: usePoints, buyerPhone: details.phone.trim() || undefined } : {}),
        }),
      })
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          if (!res.ok) {
            setQuoteError(json?.error?.message ?? null);
            return;
          }
          setQuoteError(null);
          setQuote({ key, value: json.data as Quote });
        })
        .catch(() => {});
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, stepIndex, cart.loaded, createdOrder]);

  // ─── Save the bag for reminders once we can reach the shopper ──────────────
  useEffect(() => {
    if (preview || !visitorKey || cart.items.length === 0 || createdOrder) return;
    const email = isEmail(details.email) ? details.email.trim() : "";
    const phone = isPhone(details.phone) ? details.phone.trim() : "";
    if (!email && !phone) return;
    if (email) rememberStoreVisitor(store.slug, { email, name: details.name.trim() || undefined });
    const timer = window.setTimeout(() => {
      void captureCart(store.slug, {
        visitorKey,
        email: email || undefined,
        phone: phone || undefined,
        name: details.name.trim() || undefined,
        items: cart.items,
        step: CHECKOUT_STEPS[reached],
        discountCode: code?.code,
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [visitorKey, cart.items, details.email, details.phone, details.name, reached, code?.code, createdOrder, store.slug]);

  function set<K extends keyof CheckoutDetails>(field: K, value: CheckoutDetails[K]) {
    setDetails((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function applyCode(value: string, quiet = false) {
    if (!value.trim()) return;
    setCheckingCode(true);
    setCodeError("");
    const result = await checkDiscountCode(store.id, value, cart.subtotal);
    setCheckingCode(false);
    if ("applied" in result) {
      setApplied(result.applied);
      setCodeInput("");
      rememberBagDiscount(store.slug, result.applied.code);
    } else {
      setApplied(null);
      rememberBagDiscount(store.slug, null);
      if (!quiet) setCodeError(result.error);
    }
  }

  function focusFirstError(found: FieldErrors) {
    const first = Object.keys(found)[0];
    if (!first) return;
    window.requestAnimationFrame(() => document.getElementById(`co-${first}`)?.focus());
  }

  function goTo(index: number) {
    setStepIndex(index);
    setErrors({});
    setError(null);
    window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function persist() {
    if (saveOnDevice) saveDetails(store.slug, details);
    else forgetDetails(store.slug);
  }

  function next() {
    const found = stepErrors(step, details, rules, choice);
    if (Object.keys(found).length) {
      setErrors(found);
      focusFirstError(found);
      return;
    }
    persist();
    const target = Math.min(stepIndex + 1, CHECKOUT_STEPS.length - 1);
    setReached((prev) => Math.max(prev, target));
    goTo(target);
  }

  async function placeOrder() {
    setError(null);
    // Preview never creates an order or opens a payment window.
    if (preview || cart.items.length === 0) return;
    for (const [index, entry] of CHECKOUT_STEPS.entries()) {
      const found = stepErrors(entry, details, rules, choice);
      if (Object.keys(found).length) {
        goTo(index);
        setErrors(found);
        focusFirstError(found);
        return;
      }
    }
    persist();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/store/${store.slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: details.name.trim(),
          buyerEmail: details.email.trim(),
          buyerPhone: details.phone.trim() || undefined,
          deliveryAddress: {
            street: details.street.trim(),
            city: details.city.trim(),
            state: details.state.trim() || undefined,
            country: details.country.trim() || undefined,
            landmark: details.landmark.trim() || undefined,
          },
          items: cart.items.map(({ productId, name, price, quantity, image, variant }) => ({ productId, name, price, quantity, image, variant })),
          paymentMethod: isPaystack ? "inline" : paymentMethod,
          deliveryOptionId: delivery.option?.id,
          discountCode: code?.code || undefined,
          // Only the points the server just quoted (and showed in the total) are asked for.
          redeemPoints: usePoints > 0 && liveQuote?.points ? liveQuote.points.points : undefined,
          notes: settings.enableNotes ? notes.trim() || undefined : undefined,
          giftMessage: settings.enableGiftNote ? giftMessage.trim() || undefined : undefined,
          cartToken: readCartToken(store.slug) || undefined,
          campaignToken: campaignToken || undefined,
          channel: readOrderChannel(store.slug) ?? undefined,
          affiliateCode: readLinkCode("aff", store.slug) ?? undefined,
          adCode: readLinkCode("ad", store.slug) ?? undefined,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.data?.order) {
        setError(data?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      const order = data.data.order as CreatedOrder;
      setCreatedOrder(order);
      rememberCartToken(store.slug, null);
      rememberBagDiscount(store.slug, null);
      if (paymentMethod === "paystack") return;

      // Transfer and pay on delivery orders are placed now; nothing is charged here.
      cart.clear();
      const orderPath = getPublicStorefrontPath(storeBasePath, `/order/${order.id}`);
      if (paymentMethod === "transfer" && data.data.transfer) {
        setTransfer(data.data.transfer as TransferDetails);
        window.scrollTo({ top: 0 });
      } else {
        router.push(orderPath);
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const handlePaymentSuccess = useCallback(
    async (reference: string) => {
      setPaying(true);
      try {
        const verification = await verifyPaystackPayment(reference);
        if (!verification.success) {
          setError(verification.error ?? "Payment verification failed. Please contact the store.");
          return;
        }
        const result = await updateOrderPayment(createdOrder!.id, reference);
        if (!result.success) {
          setError(result.error ?? "Your payment went through but we couldn't update the order. Please contact the store.");
          return;
        }
        cart.clear();
        router.push(getPublicStorefrontPath(storeBasePath, `/order/${createdOrder!.id}`));
      } catch {
        setError("Something went wrong confirming your payment. Please contact the store.");
      } finally {
        setPaying(false);
      }
    },
    [createdOrder, cart, router, storeBasePath],
  );

  const shell = (children: React.ReactNode) => (
    <ShopperShell theme={theme} storeName={store.name} logoUrl={store.logoUrl} basePath={storeBasePath} title="Checkout" footPayments={false}>
      {children}
    </ShopperShell>
  );

  if (createdOrder && transfer) {
    return shell(
      <div className="grid max-w-[640px] gap-5">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight" style={{ fontFamily: theme.heading }}>Order {createdOrder.orderNumber} placed</h1>
          <p className="mt-1.5 text-[15px] leading-6" style={{ color: theme.muted }}>
            Thanks, {details.name.split(" ")[0] || "there"}. Send the transfer below and the store will confirm your order once the money arrives.
          </p>
        </div>
        <TransferInstructions orderId={createdOrder.id} currency={createdOrder.currency} details={transfer} ctaBg={theme.cta} ctaText={theme.ctaText} />
        <Link href={getPublicStorefrontPath(storeBasePath, `/order/${createdOrder.id}`)} className="justify-self-center py-2 text-[15px] font-semibold underline underline-offset-4">
          View your order
        </Link>
      </div>,
    );
  }

  if (!cart.loaded) {
    return shell(<div className="grid gap-3" aria-busy="true" aria-label="Loading checkout">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-[18px]" style={{ background: theme.border }} />)}</div>);
  }

  if (cart.items.length === 0 && !createdOrder) {
    return shell(
      <Panel theme={theme} className="grid max-w-[640px] justify-items-center gap-3 px-6 py-14 text-center">
        <h1 className="text-[22px] font-semibold" style={{ fontFamily: theme.heading }}>Your bag is empty</h1>
        <p className="text-[15px]" style={{ color: theme.muted }}>Add something to your bag, then come back to check out.</p>
        <Link href={getPublicStorefrontPath(storeBasePath, "/")} className="mt-2 inline-flex min-h-12 items-center rounded-full px-7 text-[15px] font-semibold" style={{ background: theme.cta, color: theme.ctaText }}>Continue shopping</Link>
        {preview && store.storeProducts.length ? (
          <SecondaryButton
            theme={theme}
            type="button"
            onClick={() => {
              const simple = store.storeProducts.filter((product) => readVariants(product.variants).length === 0);
              for (const product of (simple.length ? simple : store.storeProducts).slice(0, 3)) cart.add({ productId: product.id, name: product.name, price: product.retailPrice, image: product.images[0] });
            }}
          >
            <Icon name="sparkle" size={15} /> Try checkout with sample items
          </SecondaryButton>
        ) : null}
      </Panel>,
    );
  }

  const nameParts = details.name.trim().split(/\s+/);
  const upsells = settings.enableUpsells && settings.upsellProducts.length
    ? suggestProducts(store.storeProducts, cart.items.map((line) => line.productId), settings.upsellProducts, 3).filter((product) => settings.upsellProducts.includes(product.id) && readVariants(product.variants).length === 0)
    : [];
  const deliveryKnown = stepIndex >= 1 || commerce.zones.length === 0;

  const giftNames = Object.fromEntries(store.storeProducts.map((product) => [product.id, product.name]));
  const deliveryOver = !game.progress.enabled || game.progress.freeDelivery ? freeDeliveryEverywhereOver(info.delivery) : null;
  const rewardsBar = !createdOrder ? (
    <RewardProgress
      compact
      subtotal={cart.subtotal}
      freeDeliveryOver={deliveryOver}
      tiers={game.progress.enabled ? game.progress.tiers : []}
      giftNames={giftNames}
      currency={store.currency}
      colors={{ ink: theme.ink, muted: theme.muted, border: theme.border, cta: theme.cta, card: theme.surface }}
      giftInBag={(id) => cart.items.some((line) => line.productId === id)}
      onAddGift={(id) => {
        const gift = store.storeProducts.find((product) => product.id === id);
        if (gift) cart.add({ productId: gift.id, name: gift.name, price: gift.retailPrice, image: gift.images[0] });
      }}
    />
  ) : null;
  const pointsBox = game.loyalty.enabled && !createdOrder && !preview ? (
    <PointsAtCheckout
      storeSlug={store.slug}
      email={details.email}
      phone={details.phone}
      base={Math.max(0, totals.subtotal - (totals.productDiscount - (liveQuote?.points?.amount ?? 0)))}
      currency={store.currency}
      settings={game.loyalty}
      using={usePoints}
      onChange={setUsePoints}
      applied={liveQuote?.points ?? null}
      colors={{ ink: theme.ink, border: theme.border, card: theme.paper, muted: theme.muted, cta: theme.cta }}
    />
  ) : null;

  const summary = (
    <OrderSummary
      theme={theme}
      currency={store.currency}
      lines={cart.items}
      totals={totals}
      pointsAmount={liveQuote?.points?.amount ?? 0}
      rewards={rewardsBar}
      extras={<>
        {settings.enableCoupon && !createdOrder ? <WonCodeBanner storeSlug={store.slug} appliedCode={applied?.code} onApply={(value) => void applyCode(value)} colors={{ ink: theme.ink, border: theme.border, card: theme.paper, muted: theme.muted }} currency={store.currency} /> : null}
        {pointsBox}
      </>}
      deliveryKnown={deliveryKnown && (commerce.zones.length === 0 || Boolean(details.city || details.state))}
      deliveryCovered={deliveryChoice.covered}
      discountLabel={liveQuote?.discount ? (liveQuote.discount.automatic ? liveQuote.discount.label : `Discount (${liveQuote.discount.code})`) : code ? `Discount (${code.code})` : "Discount"}
      coupon={settings.enableCoupon && !createdOrder ? (
        <CodeForm
          theme={theme}
          value={codeInput}
          onChange={setCodeInput}
          applied={applied}
          error={codeError || (liveQuote?.codeError && code ? liveQuote.codeError : "")}
          busy={checkingCode}
          onApply={() => void applyCode(codeInput)}
          onRemove={() => { setApplied(null); rememberBagDiscount(store.slug, null); }}
        />
      ) : null}
      trust={settings.enableTrustBadges ? <TrustLine theme={theme} labels={info.paymentLabels} payOnDelivery={info.payOnDelivery} /> : null}
      editHref={getPublicStorefrontPath(storeBasePath, "/cart")}
    />
  );

  return shell(
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] xl:gap-12">
      <div className="min-w-0">
        {/* Phones: the summary folds away above the form. */}
        <div className="mb-5 lg:hidden">
          <button
            type="button"
            onClick={() => setSummaryOpen((open) => !open)}
            aria-expanded={summaryOpen}
            aria-controls="co-summary-mobile"
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[16px] border px-4 text-[15px] font-medium focus-visible:outline focus-visible:outline-2"
            style={{ borderColor: theme.border, background: theme.surface }}
          >
            <span className="flex items-center gap-2"><Icon name="bag" size={16} /> {summaryOpen ? "Hide" : "Show"} order summary <Icon name="chevDown" size={14} className={summaryOpen ? "rotate-180" : ""} /></span>
            <span className="font-semibold tabular-nums"><Money amount={totals.total} currency={store.currency} /></span>
          </button>
          {summaryOpen ? <div id="co-summary-mobile" className="mt-3">{summary}</div> : null}
        </div>

        <StepProgress theme={theme} current={stepIndex} reached={reached} onSelect={(index) => !createdOrder && goTo(index)} />

        {preview ? <Banner theme={theme} tone="info">Test run: fill in anything you like. Nothing is charged and no order is created in preview.</Banner> : null}
        {error ? <Banner theme={theme} tone="error">{error}</Banner> : null}
        {quoteError && !error ? <Banner theme={theme} tone="error">{quoteError} <Link href={getPublicStorefrontPath(storeBasePath, "/cart")} className="font-semibold underline underline-offset-4">Edit bag</Link></Banner> : null}

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (step === "review") void placeOrder();
            else next();
          }}
        >
          <Panel theme={theme} className="p-5 sm:p-6">
            <h1 ref={headingRef} tabIndex={-1} className="mb-1 text-[22px] font-semibold outline-none" style={{ fontFamily: theme.heading }}>
              {step === "contact" ? "Your details" : step === "delivery" ? "Where should we deliver?" : step === "payment" ? "How would you like to pay?" : "Check and place your order"}
            </h1>
            <p className="mb-5 text-[14px]" style={{ color: theme.muted }}>
              {step === "contact"
                ? "No account needed. We'll send your receipt and order updates here."
                : step === "delivery"
                  ? "Your address and how you'd like to get your order."
                  : step === "payment"
                    ? "These are the ways this store accepts."
                    : "Make sure everything looks right."}
            </p>

            {step === "contact" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField theme={theme} id="co-name" label="Full name" value={details.name} onChange={(v) => set("name", v)} error={errors.name} autoComplete="name" className="sm:col-span-2" />
                <TextField theme={theme} id="co-email" label="Email" type="email" inputMode="email" value={details.email} onChange={(v) => set("email", v)} error={errors.email} autoComplete="email" />
                <TextField theme={theme} id="co-phone" label={settings.requirePhone ? "Phone number" : "Phone number (optional)"} type="tel" inputMode="tel" value={details.phone} onChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" hint="For delivery updates from the store or rider." />
              </div>
            ) : null}

            {step === "delivery" ? (
              <div className="grid gap-4">
                <TextField theme={theme} id="co-street" label="Street address" value={details.street} onChange={(v) => set("street", v)} error={errors.street} autoComplete="street-address" hint="House number, street and estate." />
                <div className="grid gap-4 sm:grid-cols-2">
                  {regions.length ? (
                    <SelectField theme={theme} id="co-state" label="State" value={details.state} onChange={(v) => set("state", v)} error={errors.state} autoComplete="address-level1" options={regions} placeholder="Choose your state" />
                  ) : (
                    <TextField theme={theme} id="co-state" label="State or region (optional)" value={details.state} onChange={(v) => set("state", v)} error={errors.state} autoComplete="address-level1" />
                  )}
                  <TextField theme={theme} id="co-city" label="Area or city" value={details.city} onChange={(v) => set("city", v)} error={errors.city} autoComplete="address-level2" list="co-areas" hint="For example Lekki, Ikeja or Wuse." />
                  <datalist id="co-areas">
                    {[...new Set(commerce.zones.flatMap((zone) => zone.regions))].map((region) => <option key={region} value={region} />)}
                  </datalist>
                  <TextField theme={theme} id="co-landmark" label="Nearest landmark (optional)" value={details.landmark} onChange={(v) => set("landmark", v)} autoComplete="off" hint="Helps the rider find you." />
                  <SelectField theme={theme} id="co-country" label="Country" value={details.country} onChange={(v) => setDetails((prev) => ({ ...prev, country: v, state: "" }))} autoComplete="country-name" options={[...new Set([details.country, ...COUNTRY_NAMES].filter(Boolean))]} />
                </div>

                <fieldset className="m-0 mt-1 border-0 p-0">
                  <legend className="mb-2 p-0 text-[15px] font-semibold">Delivery option</legend>
                  {!details.city && !details.state && commerce.zones.length ? (
                    <p className="text-[14px]" style={{ color: theme.muted }}>Enter your state and area to see delivery options.</p>
                  ) : !deliveryChoice.covered ? (
                    <p className="rounded-[14px] px-4 py-3 text-[14px]" style={{ background: theme.paper }}>
                      The store hasn&apos;t set a delivery fee for this area. You can still order and they&apos;ll contact you to arrange delivery.
                    </p>
                  ) : deliveryChoice.options.length === 0 ? (
                    <p className="text-[14px]" style={{ color: theme.muted }}>Delivery to this area is free.</p>
                  ) : (
                    <div className="grid gap-2.5" id="co-deliveryOption" tabIndex={-1}>
                      {deliveryChoice.options.map((option) => (
                        <ChoiceCard
                          key={option.id}
                          theme={theme}
                          name="deliveryOption"
                          checked={delivery.option?.id === option.id}
                          onSelect={() => setDeliveryOptionId(option.id)}
                          title={option.name}
                          detail={[option.estimatedDays, option.pickup ? "You collect it" : null].filter(Boolean).join(" · ") || undefined}
                          aside={option.price > 0 ? formatStoreMoney(option.price, store.currency) : "Free"}
                        />
                      ))}
                    </div>
                  )}
                  {errors.deliveryOption ? <p role="alert" className="mt-1.5 text-[13px]" style={{ color: "#B42318" }}>{errors.deliveryOption}</p> : null}
                </fieldset>

                <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-[14.5px]">
                  <input type="checkbox" checked={saveOnDevice} onChange={(event) => setSaveOnDevice(event.target.checked)} className="h-5 w-5 shrink-0" style={{ accentColor: theme.cta }} />
                  Save my details on this device for next time
                </label>
              </div>
            ) : null}

            {step === "payment" ? (
              <div className="grid gap-3">
                <fieldset className="m-0 border-0 p-0">
                  <legend className="sr-only">Payment method</legend>
                  <div className="grid gap-2.5" id="co-paymentMethod" tabIndex={-1}>
                    {paymentOptions.map((option) => (
                      <ChoiceCard
                        key={option.key}
                        theme={theme}
                        name="paymentMethod"
                        checked={option.key === paymentMethod}
                        onSelect={() => setChosenMethod(option.key)}
                        title={option.label}
                        detail={option.hint}
                        icon={option.key === "paystack" ? "card" : option.key === "transfer" ? "bank" : "truck"}
                      />
                    ))}
                  </div>
                </fieldset>
                {errors.paymentMethod ? <p role="alert" className="text-[13px]" style={{ color: "#B42318" }}>{errors.paymentMethod}</p> : null}
                {paymentMethod === "pay_on_delivery" ? (
                  <div className="grid gap-2">
                    <TextField theme={theme} id="co-phone" label="Phone number for the rider" type="tel" inputMode="tel" value={details.phone} onChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" />
                    <p className="text-[13px]" style={{ color: theme.muted }}>Have <Money amount={totals.total} currency={store.currency} /> ready when your order arrives.</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === "review" ? (
              <div className="grid gap-4">
                <ReviewBlock theme={theme} title="Contact" onEdit={createdOrder ? undefined : () => goTo(0)}>
                  {details.name}<br />{details.email}{details.phone ? <><br />{details.phone}</> : null}
                </ReviewBlock>
                <ReviewBlock theme={theme} title="Delivery" onEdit={createdOrder ? undefined : () => goTo(1)}>
                  {[details.street, details.city, details.state, details.country].filter(Boolean).join(", ")}
                  {details.landmark ? <><br />Near {details.landmark}</> : null}
                  <br />
                  <span style={{ color: theme.muted }}>
                    {delivery.option
                      ? `${delivery.option.name} · ${totals.shippingFee - totals.deliveryDiscount > 0 ? formatStoreMoney(totals.shippingFee - totals.deliveryDiscount, store.currency) : "Free"}${delivery.option.estimatedDays ? ` · ${delivery.option.estimatedDays}` : ""}`
                      : deliveryChoice.covered ? "Free delivery" : "The store will confirm delivery with you"}
                  </span>
                </ReviewBlock>
                <ReviewBlock theme={theme} title="Payment" onEdit={createdOrder ? undefined : () => goTo(2)}>
                  {paymentOptions.find((option) => option.key === paymentMethod)?.label}
                </ReviewBlock>

                {settings.enableNotes ? (
                  <TextAreaField theme={theme} id="co-notes" label="Order note (optional)" value={notes} onChange={setNotes} hint="Anything the store should know, like a good time to deliver." disabled={Boolean(createdOrder)} />
                ) : null}
                {settings.enableGiftNote ? (
                  <TextAreaField theme={theme} id="co-gift" label="Gift message (optional)" value={giftMessage} onChange={setGiftMessage} hint="The store will include it with your order." disabled={Boolean(createdOrder)} />
                ) : null}

                {upsells.length && !createdOrder ? (
                  <section aria-labelledby="co-upsell" className="grid gap-2">
                    <h2 id="co-upsell" className="text-[15px] font-semibold">Add to your order</h2>
                    <ul className="m-0 grid list-none gap-2 p-0">
                      {upsells.map((product) => (
                        <li key={product.id} className="flex items-center gap-3 rounded-[14px] border p-2.5" style={{ borderColor: theme.border }}>
                          <ItemThumb theme={theme} src={product.images[0]} alt="" size={48} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium">{product.name}</span>
                            <span className="block text-[13px]" style={{ color: theme.muted }}>{formatStoreMoney(product.retailPrice, store.currency)}</span>
                          </span>
                          <SecondaryButton theme={theme} type="button" onClick={() => cart.add({ productId: product.id, name: product.name, price: product.retailPrice, image: product.images[0] })} aria-label={`Add ${product.name} to your order`}>
                            <Icon name="plus" size={14} /> Add
                          </SecondaryButton>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
              {stepIndex > 0 && !createdOrder ? (
                <SecondaryButton theme={theme} type="button" onClick={() => goTo(stepIndex - 1)} className="sm:min-w-[120px]">
                  <Icon name="arrowLeft" size={15} /> Back
                </SecondaryButton>
              ) : !createdOrder ? (
                <Link href={getPublicStorefrontPath(storeBasePath, "/cart")} className="inline-flex min-h-11 items-center justify-center gap-2 text-[14px] font-medium underline underline-offset-4">
                  Back to bag
                </Link>
              ) : null}
              <div className="sm:ml-auto sm:min-w-[260px]">
                {step === "review" && preview ? (
                  <button
                    type="button"
                    disabled
                    aria-describedby="co-preview-note"
                    className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border-2 border-dashed px-6 text-[15px] font-semibold"
                    style={{ borderColor: theme.border, color: theme.muted, background: theme.paper }}
                  >
                    <Icon name="lock" size={16} /> Checkout is off in preview
                  </button>
                ) : step === "review" && createdOrder && isPaystack ? (
                  <PaystackCheckoutButton
                    amount={createdOrder.total}
                    email={details.email}
                    firstName={nameParts[0]}
                    lastName={nameParts.slice(1).join(" ")}
                    phone={details.phone}
                    metadata={{ orderId: createdOrder.id, orderNumber: createdOrder.orderNumber }}
                    onSuccess={handlePaymentSuccess}
                    onClose={() => setPayClosed(true)}
                    disabled={paying}
                    label={paying ? "Confirming payment…" : `Pay ${formatStoreMoney(createdOrder.total, createdOrder.currency)}`}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-[16px] font-semibold disabled:opacity-60"
                    style={{ background: theme.cta, color: theme.ctaText, border: "none" }}
                  />
                ) : (
                  <PrimaryButton theme={theme} type="submit" disabled={submitting || (step === "review" && Boolean(quoteError))} className="w-full">
                    {step === "review"
                      ? submitting
                        ? "Placing order…"
                        : isPaystack
                          ? <><Icon name="lock" size={16} /> Pay {formatStoreMoney(totals.total, store.currency)}</>
                          : "Place order"
                      : <>Continue to {CHECKOUT_STEP_LABELS[CHECKOUT_STEPS[stepIndex + 1]!].toLowerCase()} <Icon name="arrow" size={15} /></>}
                  </PrimaryButton>
                )}
              </div>
            </div>
            {step === "review" && preview ? (
              <div id="co-preview-note" className="mt-4 rounded-[14px] border border-dashed px-4 py-3 text-[13.5px] leading-6" style={{ borderColor: theme.border, background: theme.paper }}>
                <p className="m-0 font-semibold">This is where shoppers pay.</p>
                <p className="m-0 mt-1" style={{ color: theme.muted }}>
                  Once your store is live, this button reads{" "}
                  <strong style={{ color: theme.ink }}>{isPaystack ? `Pay ${formatStoreMoney(totals.total, store.currency)}` : "Place order"}</strong>. In preview nothing is charged and no order is created.
                  To try a real test order, go live, place one with pay on delivery or bank transfer, then cancel it from Orders.
                </p>
              </div>
            ) : null}
            {step === "review" && policies.length ? (
              <p className="mb-0 mt-3 text-[12.5px] leading-5" style={{ color: theme.muted }}>
                By placing your order you agree to our{" "}
                {policies.map((link, index) => (
                  <span key={link.key}>
                    {index > 0 ? (index === policies.length - 1 ? " and " : ", ") : null}
                    <a href={getPublicStorefrontPath(storeBasePath, legalPagePath(link.key))} target="_blank" rel="noopener" className="underline underline-offset-2" style={{ color: theme.ink }}>{link.title.toLowerCase()}</a>
                  </span>
                ))}
                .
              </p>
            ) : null}
            {createdOrder && isPaystack ? (
              <p className="mt-3 text-[13.5px]" style={{ color: theme.muted }} role="status">
                Order {createdOrder.orderNumber} is saved. {payClosed ? "The payment window closed before you paid. " : ""}Tap pay to finish with Paystack.
              </p>
            ) : null}
          </Panel>
        </form>
      </div>

      <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label="Order summary">{summary}</aside>
    </div>,
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function StepProgress({ theme, current, reached, onSelect }: { theme: ShopperTheme; current: number; reached: number; onSelect: (index: number) => void }) {
  const percent = Math.round(((current + 1) / CHECKOUT_STEPS.length) * 100);
  return (
    <nav aria-label="Checkout progress" className="mb-5">
      <p className="mb-2 text-[13px] font-medium sm:hidden" style={{ color: theme.muted }}>
        Step {current + 1} of {CHECKOUT_STEPS.length}: {CHECKOUT_STEP_LABELS[CHECKOUT_STEPS[current]!]}
      </p>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full sm:hidden" style={{ background: theme.border }} aria-hidden>
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${percent}%`, background: theme.cta }} />
      </div>
      <ol className="m-0 hidden list-none grid-cols-4 gap-2 p-0 sm:grid">
        {CHECKOUT_STEPS.map((entry, index) => {
          const done = index < current;
          const active = index === current;
          const reachable = index <= reached && !active;
          return (
            <li key={entry} className="min-w-0">
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
                  {CHECKOUT_STEP_LABELS[entry]}
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

function OrderSummary({
  theme,
  currency,
  lines,
  totals,
  pointsAmount = 0,
  rewards,
  extras,
  deliveryKnown,
  deliveryCovered,
  discountLabel,
  coupon,
  trust,
  editHref,
}: {
  theme: ShopperTheme;
  currency: string;
  lines: CartLine[];
  totals: OrderTotals;
  /** Loyalty points' share of totals.productDiscount, shown on its own line. */
  pointsAmount?: number;
  rewards?: React.ReactNode;
  extras?: React.ReactNode;
  deliveryKnown: boolean;
  deliveryCovered: boolean;
  discountLabel: string;
  coupon: React.ReactNode;
  trust: React.ReactNode;
  editHref: string;
}) {
  const deliveryCharge = totals.shippingFee - totals.deliveryDiscount;
  const codeDiscount = Math.max(0, Math.round((totals.productDiscount - pointsAmount) * 100) / 100);
  return (
    <Panel theme={theme} className="grid gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold" style={{ fontFamily: theme.heading }}>Order summary</h2>
        <Link href={editHref} className="text-[13.5px] font-medium underline underline-offset-4">Edit bag</Link>
      </div>
      <ul className="m-0 grid max-h-[320px] list-none gap-3 overflow-y-auto p-0 pt-1">
        {lines.map((line) => (
          <li key={lineKey(line)} className="flex items-center gap-3">
            <span className="relative">
              <ItemThumb theme={theme} src={line.image} alt="" size={56} />
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold" style={{ background: theme.ink, color: theme.paper }} aria-hidden>{line.quantity}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{line.name}</span>
              <span className="block text-[12.5px]" style={{ color: theme.muted }}>{[line.variant, `Qty ${line.quantity}`].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="text-[14px] font-medium tabular-nums"><Money amount={line.price * line.quantity} currency={currency} /></span>
          </li>
        ))}
      </ul>
      {rewards}
      {coupon}
      {extras}
      <dl className="grid gap-2 border-t pt-4 text-[14.5px]" style={{ borderColor: theme.border }}>
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
            {!deliveryKnown ? <span style={{ color: theme.muted }}>Next step</span> : !deliveryCovered ? <span style={{ color: theme.muted }}>Arranged by the store</span> : deliveryCharge > 0 ? <Money amount={deliveryCharge} currency={currency} /> : totals.deliveryDiscount > 0 ? `Free (${discountLabel.toLowerCase()})` : "Free"}
          </dd>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t pt-3 text-[18px] font-semibold" style={{ borderColor: theme.border }}>
          <dt>Total</dt>
          <dd className="m-0 tabular-nums"><Money amount={totals.total} currency={currency} /></dd>
        </div>
      </dl>
      {trust}
      <WeAccept muted={theme.muted} />
    </Panel>
  );
}

function CodeForm({ theme, value, onChange, applied, error, busy, onApply, onRemove }: { theme: ShopperTheme; value: string; onChange: (v: string) => void; applied: AppliedCode | null; error: string; busy: boolean; onApply: () => void; onRemove: () => void }) {
  const id = useId();
  if (applied) {
    return (
      <div>
        <div className="flex items-center gap-2 rounded-[14px] px-3 py-2 text-[14px]" style={{ background: theme.paper }}>
          <Icon name="tag" size={15} />
          <span className="min-w-0 flex-1"><strong>{applied.code}</strong> applied</span>
          <button type="button" onClick={onRemove} className="min-h-10 px-2 text-[13px] font-medium underline underline-offset-4">Remove</button>
        </div>
        {error ? <p role="alert" className="mt-1.5 text-[13px]" style={{ color: "#B42318" }}>{error}</p> : null}
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
      {error ? <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px]" style={{ color: "#B42318" }}>{error}</p> : null}
    </div>
  );
}

function ReviewBlock({ theme, title, onEdit, children }: { theme: ShopperTheme; title: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[16px] border p-4" style={{ borderColor: theme.border }}>
      <div className="min-w-0 flex-1">
        <h2 className="text-[13.5px] font-semibold" style={{ color: theme.muted }}>{title}</h2>
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

function ChoiceCard({ theme, name, checked, onSelect, title, detail, aside, icon }: { theme: ShopperTheme; name: string; checked: boolean; onSelect: () => void; title: string; detail?: string; aside?: string; icon?: "card" | "bank" | "truck" }) {
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
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1.5 text-[13px]" style={{ color: "#B42318" }}>
          <Icon name="warn" size={13} /> {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px]" style={{ color: theme.muted }}>{hint}</p>
      ) : null}
    </div>
  );
}

function TextField({
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
        style={{ borderColor: error ? "#B42318" : theme.border, color: "#16141F" }}
      />
    </FieldShell>
  );
}

function SelectField({ theme, id, label, value, onChange, error, options, placeholder, autoComplete }: { theme: ShopperTheme; id: string; label: string; value: string; onChange: (value: string) => void; error?: string; options: string[]; placeholder?: string; autoComplete?: string }) {
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
        style={{ borderColor: error ? "#B42318" : theme.border, color: "#16141F" }}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </FieldShell>
  );
}

function TextAreaField({ theme, id, label, value, onChange, hint, disabled }: { theme: ShopperTheme; id: string; label: string; value: string; onChange: (value: string) => void; hint?: string; disabled?: boolean }) {
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
