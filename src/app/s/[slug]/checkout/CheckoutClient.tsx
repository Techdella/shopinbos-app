"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { useStoreCheckoutStart } from "@/lib/analytics/storefront-events";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { readLinkCode, readOrderChannel, useCampaignAttribution } from "@/hooks/useCampaignAttribution";
import { readRememberedStoreVisitor, rememberStoreVisitor, useStoreVisitor } from "@/hooks/useStoreVisitor";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { checkoutLegalLinks, legalPagePath } from "@/lib/legal/pages";
import { formatStoreMoney, freeDeliveryEverywhereOver, readShopperInfo, whatsappLink } from "@/lib/storefront/shopper-info";
import { whatsappOrderMessage } from "@shared/seller-payments";
import { discountAmount } from "@/lib/discounts";
import { PaystackCheckoutButton } from "@/components/payments/PaystackCheckout";
import { KorapayFrame } from "@/components/payments/KorapayFrame";
import { verifyPaystackPayment, updateOrderPayment } from "@/app/actions/payments";
import { checkoutPaymentOptions, noWayToPayText, type CheckoutPaymentMethod } from "@shared/checkout-payments";
import {
  CHECKOUT_STEP_LABELS,
  chooseDelivery,
  deliveryOptionsFor,
  isEmail,
  isPhone,
  orderTotals,
  stepErrors,
  suggestProducts,
  type CheckoutDetails,
  type CheckoutRules,
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
import { Banner } from "@/components/storefront/shopper/CartPage";
import { ItemThumb, Panel, PrimaryButton, SecondaryButton, ShopperShell } from "@/components/storefront/shopper/ShopperShell";
import { needsOptions, readVariants } from "@/components/storefront/shopper/catalog";
import { WeAccept } from "@/components/storefront/shopper/StoreFooterBadges";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import type { ShopperCommerce, ShopperStore } from "@/components/storefront/shopper/types";
import {
  CheckoutFrame,
  CheckoutMessage,
  CodeForm,
  ContactFields,
  DeliveryFields,
  ErrorSummary,
  FormSection,
  OrderSummary,
  PaymentFields,
  ReviewBlock,
  StepProgress,
  TextAreaField,
  TextField,
} from "@/components/storefront/checkout/CheckoutParts";
import {
  LAYOUT_STEPS,
  LAYOUT_STEP_TITLES,
  checkoutTrustBadges,
  continueLabel,
  deliveryEstimateText,
  errorFields,
  errorSummaryText,
  errorsForSteps,
  firstStepWithErrors,
  placeOrderLabel,
  reachedCheckoutStep,
  readCheckoutPageSettings,
  resumeStepIndex,
  secureCheckoutText,
  showsHeaderNav,
  stepsFor,
  visibleSummaryBlocks,
  whatsappHelpHref,
} from "@/components/storefront/checkout/checkout-layout";
import type { CheckoutDesign } from "@/components/storefront/checkout/checkout-theme";
import { PartnerDeliveryChoices, hasPartnerParcels, isPartnerOption, partnerDeliveryProblem, partnerPaymentOptions, readQuotedDelivery, type QuotedDelivery } from "@/components/storefront/checkout/PartnerDelivery";
import { PhoneCheck, usePhoneCheck } from "@/components/storefront/checkout/PhoneCheck";
import { ParcelList, hasSupplierDelivery, readQuotedParcels } from "@/components/storefront/checkout/Parcels";
import { TransferInstructions, type TransferDetails } from "../order/[orderId]/TransferInstructions";
import { readGameConfig } from "@/lib/gamification/logic";
import { RewardProgress } from "@/components/storefront/gamification/RewardProgress";
import { PointsAtCheckout, WonCodeBanner } from "@/components/storefront/gamification/Rewards";

// The checkout in the layout the seller chose in the store builder (checkout page settings, read from the published
// snapshot): Two columns, One page, Steps (contact → delivery → payment) or Minimal. Guest checkout (no account),
// details saved on this device when the shopper agrees, delivery options from the seller's zones (or, with delivery
// partners at checkout, the options the server quotes for the address: PartnerDelivery.tsx), the seller's payment
// methods (Paystack, bank transfer, pay on delivery), totals quoted by the server, and the bag saved for reminders once
// we can reach the shopper. In the owner's preview of a store that isn't live, everything works but nothing is quoted
// by the server, saved for reminders, charged or ordered.

interface Props {
  store: ShopperStore;
  storeBasePath: string;
  commerce: ShopperCommerce;
  /** Owner preview of a store that isn't live: the full checkout UI, without payment or order creation. */
  preview?: boolean;
  /** Layout, look and header links from the store's published snapshot (checkoutDesignFor). */
  design?: CheckoutDesign;
}

interface CreatedOrder {
  id: string;
  orderNumber: string;
  total: number;
  currency: string;
  /** The Paystack transaction the server started (split to the businesses' banks), reopened in the popup. */
  paystackAccessCode?: string | null;
  /** A preorder deposit: the card payment is payNow; the rest is due once the stock is ready. */
  deposit?: { payNow: number; balance: number } | null;
  /** Pay on delivery: the delivery fee paid now (naira; 0 when delivery is free), the rest in the app at the door. */
  podFee?: number;
}

interface Quote {
  totals: OrderTotals;
  discount: { code: string; label: string; automatic: boolean } | null;
  codeError: string | null;
  /** Loyalty points the server took off (inside totals). */
  points?: { points: number; amount: number; balance: number; max: number } | null;
  /** The delivery options for the address (delivery partners' options when `partners`). */
  delivery?: unknown;
  /** Preorder lines with a deposit (shared/preorder.ts): paying by card charges payNow, the balance when it ships. */
  deposit?: { payNow: number; balance: number } | null;
  /** Some items ship from a supplier: paid only in the app (shared/checkout-payments.ts fromSuppliers). */
  fromSuppliers?: boolean;
}

const EMPTY_DETAILS: CheckoutDetails = { name: "", email: "", phone: "", street: "", city: "", state: "", country: "", landmark: "" };

export function CheckoutClient({ store, storeBasePath, commerce, preview = false, design }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cart = useCart(store.slug);
  const visitorKey = useStoreVisitor(store.slug);
  const campaignToken = useCampaignAttribution(preview ? "" : store.slug);
  useStoreCheckoutStart(preview ? "" : store.slug, { items: cart.items, loaded: cart.loaded, currency: store.currency });
  const theme = useMemo(() => design?.theme ?? resolveShopperTheme(store.brandSettings), [design?.theme, store.brandSettings]);
  const layout = useMemo(() => design?.settings ?? readCheckoutPageSettings(null, ""), [design?.settings]);
  const policies = useMemo(() => checkoutLegalLinks(store.brandSettings), [store.brandSettings]);
  const info = useMemo(() => readShopperInfo(store.shopper), [store.shopper]);
  const settings = commerce.checkout;
  const homeCountry = countryName(store.country);
  const steps = stepsFor(layout.layout);
  const stepped = steps.length > 0;

  const [details, setDetails] = useState<CheckoutDetails>({ ...EMPTY_DETAILS, country: homeCountry });
  const [stepIndex, setStepIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorNote, setErrorNote] = useState("");
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
  // Korapay's payment page for the order just placed, shown in a frame over the checkout.
  const [korapay, setKorapay] = useState<{ orderId: string; checkoutUrl: string } | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<AppliedCode | null>(null);
  const [codeError, setCodeError] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [quote, setQuote] = useState<{ key: string; value: Quote } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Delivery partners at checkout: the options the server quoted, for the bag and address in `key`.
  const [market, setMarket] = useState<{ key: string; value: QuotedDelivery | null } | null>(null);
  // Loyalty points the shopper chose to use (Marketing > Rewards); the server's quote decides what applies.
  const game = useMemo(() => readGameConfig((store.brandSettings as Record<string, unknown> | null | undefined)?.gamification ?? {}), [store.brandSettings]);
  const [usePoints, setUsePoints] = useState(0);

  const step = stepped ? steps[Math.min(stepIndex, steps.length - 1)]! : null;
  const finalStep = !stepped || step === "payment";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const regions = useMemo(() => regionsFor(details.country), [details.country]);

  // ─── Money (estimate first, then the server's quote for the same inputs) ───
  const address = { city: details.city, state: details.state };
  // Delivery partners at checkout: the options come from the server's quote for this bag and address (refreshed,
  // debounced, as the state or area changes); the store's zones aren't used.
  const partners = commerce.deliveryMode === "partners";
  const hasAddress = Boolean(details.city.trim() || details.state.trim());
  const marketKey = JSON.stringify([cart.items.map((line) => [line.productId, line.variant ?? "", line.quantity]), details.city, details.state]);
  const liveMarket = partners && market && market.key === marketKey ? market : null;
  const marketPending = partners && !preview && hasAddress && !liveMarket;
  const marketDelivery = liveMarket?.value ?? null;
  const deliveryChoice = partners
    ? { covered: marketDelivery?.covered ?? true, options: marketDelivery?.options ?? [] }
    : deliveryOptionsFor(commerce.zones, commerce.flatRate, address, cart.subtotal);
  const delivery = chooseDelivery(deliveryChoice, deliveryOptionId);
  const marketOption = partners ? marketDelivery?.options.find((option) => option.id === delivery.option?.id) ?? null : null;
  // What stops the order with delivery partners: no address yet, still checking, or nothing covers the address.
  const marketProblem = partners && !preview ? partnerDeliveryProblem({ hasAddress, pending: marketPending, delivery: marketDelivery }) : null;
  // A delivery partner's rider needs a verified phone (spec §6.1): a code by WhatsApp/SMS, then the order carries
  // the phoneToken (PhoneCheck.tsx). Only when the chosen option books a partner.
  const phoneCheck = usePhoneCheck({ storeSlug: store.slug, phone: details.phone, enabled: partners && !preview, needed: hasPartnerParcels(marketOption) });
  const code = settings.enableCoupon ? applied : null;
  const estimate = orderTotals({
    subtotal: cart.subtotal,
    shippingFee: delivery.fee,
    discount: code ? { type: code.type, amount: discountAmount(code, cart.items, delivery.fee) } : null,
  });
  const quoteKey = JSON.stringify([cart.items.map((line) => [line.productId, line.variant ?? "", line.quantity]), details.city, details.state, partners ? deliveryOptionId : delivery.option?.id ?? null, code?.code ?? "", isEmail(details.email) ? details.email.trim().toLowerCase() : "", usePoints, usePoints ? details.phone.trim() : ""]);
  const liveQuote = quote && quote.key === quoteKey ? quote.value : null;
  const totals = liveQuote?.totals ?? estimate;
  // Dropship items from suppliers ship as their own parcels, each with its fee (already inside the quote's totals).
  const parcels = useMemo(() => readQuotedParcels(liveQuote?.delivery), [liveQuote]);
  const supplierDelivers = hasSupplierDelivery(parcels);
  const fromSuppliers = liveQuote?.fromSuppliers === true;

  // With delivery partners, pay on delivery goes with the chosen option (partnerPaymentOptions, as the checkout API).
  const paymentOptions = useMemo(
    () => (partners
      ? partnerPaymentOptions(commerce.payments, { city: details.city, state: details.state, total: totals.total, fromSuppliers }, marketOption)
      : checkoutPaymentOptions(commerce.payments, { city: details.city, state: details.state, total: totals.total, fromSuppliers }))
      // A supplier delivering its own parcel takes no cash (the checkout API refuses pay on delivery then).
      .filter((option) => !(supplierDelivers && option.key === "pay_on_delivery")),
    [partners, marketOption, commerce.payments, details.city, details.state, totals.total, supplierDelivers, fromSuppliers],
  );
  // Keep the shopper's pick while it is still on offer (an address or total change can rule pay on delivery out).
  // No way to pay that works for this order: nothing is placed, and the shopper is told to message the store.
  const noWayToPay = paymentOptions.length === 0 ? noWayToPayText(commerce.payments, { city: details.city, state: details.state, total: totals.total, fromSuppliers }) : null;
  const paymentMethod: CheckoutPaymentMethod = paymentOptions.some((option) => option.key === chosenMethod) ? chosenMethod! : paymentOptions[0]?.key ?? "transfer";
  const isPaystack = paymentMethod === "paystack";
  // Pay on delivery (shared/pay-at-door.ts): the delivery fee is paid now with Paystack, the rest in the app at the door.
  const podFeeNow = paymentMethod === "pay_on_delivery" ? Math.max(0, (createdOrder?.podFee ?? (liveQuote?.totals ?? estimate).shippingFee - (liveQuote?.totals ?? estimate).deliveryDiscount)) : 0;
  const paysNow = isPaystack || podFeeNow > 0;

  const rules: CheckoutRules = {
    // Delivery partners need a phone for the rider and a state to find who covers the address; a supplier delivering
    // its own parcel texts the customer a delivery code.
    requirePhone: settings.requirePhone || partners || supplierDelivers,
    requireState: partners || regions.length > 0,
    deliveryOptionIds: deliveryChoice.options.map((option) => option.id),
    paymentMethods: paymentOptions.map((option) => option.key),
  };
  const choice = { deliveryOptionId: delivery.option?.id ?? null, paymentMethod };
  // How far the shopper got, for reminders: the step they reached (Steps), else the first part still missing.
  const capturedStep = stepped ? LAYOUT_STEPS[Math.min(reached, LAYOUT_STEPS.length - 1)]! : reachedCheckoutStep(details, rules, choice);

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
    // On Steps, a returning shopper with their details saved starts at the first step that still needs something.
    if (stepped && Object.keys(saved).length > 0 && searchParams.get("step") !== "contact") {
      const nextRegions = regionsFor(next.country);
      const nextChoice = partners ? { covered: true, options: [] } : deliveryOptionsFor(commerce.zones, commerce.flatRate, next, cart.subtotal);
      const start = resumeStepIndex(next, { ...rules, requireState: nextRegions.length > 0, deliveryOptionIds: nextChoice.options.map((option) => option.id) }, {
        deliveryOptionId: nextChoice.options[0]?.id ?? null,
        paymentMethod: paymentOptions[0]?.key,
      });
      setStepIndex(start);
      setReached(start);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.loaded]);

  // ─── Server quote once the address is known ────────────────────────────────
  useEffect(() => {
    if (preview || !cart.loaded || cart.items.length === 0 || createdOrder || (stepped && stepIndex < 1)) return;
    if ((commerce.zones.length > 0 || partners) && !details.city && !details.state) return;
    const key = quoteKey;
    const deliveryKey = marketKey;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/public/store/${encodeURIComponent(store.slug)}/checkout/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          items: cart.items.map((line) => ({ productId: line.productId, quantity: line.quantity, variant: line.variant, variantId: line.variantId })),
          address: { city: details.city, state: details.state },
          deliveryOptionId: (partners ? deliveryOptionId : delivery.option?.id) ?? undefined,
          discountCode: code?.code,
          buyerEmail: isEmail(details.email) ? details.email.trim() : undefined,
          ...(usePoints > 0 ? { redeemPoints: usePoints, buyerPhone: details.phone.trim() || undefined } : {}),
        }),
      })
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          if (!res.ok) {
            setQuoteError(json?.error?.message ?? null);
            if (partners) setMarket({ key: deliveryKey, value: null });
            return;
          }
          setQuoteError(null);
          setQuote({ key, value: json.data as Quote });
          if (partners) setMarket({ key: deliveryKey, value: readQuotedDelivery(json.data?.delivery) });
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
        step: capturedStep,
        discountCode: code?.code,
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [visitorKey, cart.items, details.email, details.phone, details.name, capturedStep, code?.code, createdOrder, store.slug]);

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

  /** Shows the errors, announces what's wrong and moves focus to the first field that needs fixing. */
  function showErrors(found: FieldErrors) {
    setErrors(found);
    setErrorNote(errorSummaryText(found));
    const first = errorFields(found)[0];
    if (!first) return;
    window.requestAnimationFrame(() => document.getElementById(`co-${first}`)?.focus());
  }

  function goTo(index: number) {
    setStepIndex(index);
    setErrors({});
    setErrorNote("");
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
    if (!step) return;
    const found = stepErrors(step, details, rules, choice);
    if (step === "delivery" && marketProblem && !found.deliveryOption) found.deliveryOption = marketProblem;
    if (Object.keys(found).length) {
      showErrors(found);
      return;
    }
    if (step === "delivery" && phoneCheck.blocker) return blockOnPhone(phoneCheck.blocker);
    persist();
    const target = Math.min(stepIndex + 1, steps.length - 1);
    setReached((prev) => Math.max(prev, target));
    goTo(target);
  }

  /** The phone isn't verified yet: say so in the phone box (on the delivery step) and move focus there. */
  function blockOnPhone(message: string) {
    const deliveryStep = steps.indexOf("delivery");
    if (stepped && deliveryStep >= 0 && deliveryStep !== stepIndex) goTo(deliveryStep);
    phoneCheck.showError(message);
    window.requestAnimationFrame(() => document.getElementById("co-phone-check")?.focus());
  }

  async function placeOrder() {
    setError(null);
    // Preview never creates an order or opens a payment window.
    if (preview || cart.items.length === 0) return;
    if (noWayToPay) return setError(noWayToPay);
    if (stepped) {
      const failing = firstStepWithErrors(steps, details, rules, choice);
      if (failing >= 0) {
        if (failing !== stepIndex) goTo(failing);
        showErrors(stepErrors(steps[failing]!, details, rules, choice));
        return;
      }
    } else {
      const found = errorsForSteps(LAYOUT_STEPS, details, rules, choice);
      if (Object.keys(found).length) {
        showErrors(found);
        return;
      }
    }
    // Delivery partners: the checkout API refuses an address no option covers, so say why here first.
    if (marketProblem) {
      const deliveryStep = steps.indexOf("delivery");
      if (stepped && deliveryStep >= 0 && deliveryStep !== stepIndex) goTo(deliveryStep);
      showErrors({ deliveryOption: marketProblem });
      return;
    }
    // Delivery partners: no order until the phone took its code (the checkout API checks the token too).
    if (phoneCheck.blocker) return blockOnPhone(phoneCheck.blocker);
    setErrorNote("");
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
          items: cart.items.map(({ productId, name, price, quantity, image, variant, variantId }) => ({ productId, name, price, quantity, image, variant, variantId })),
          paymentMethod: isPaystack ? "inline" : paymentMethod,
          deliveryOptionId: delivery.option?.id,
          discountCode: code?.code || undefined,
          // Only the points the server just quoted (and showed in the total) are asked for.
          redeemPoints: usePoints > 0 && liveQuote?.points ? liveQuote.points.points : undefined,
          notes: settings.enableNotes && layout.orderNote ? notes.trim() || undefined : undefined,
          giftMessage: settings.enableGiftNote ? giftMessage.trim() || undefined : undefined,
          cartToken: readCartToken(store.slug) || undefined,
          campaignToken: campaignToken || undefined,
          channel: readOrderChannel(store.slug) ?? undefined,
          affiliateCode: readLinkCode("aff", store.slug) ?? undefined,
          adCode: readLinkCode("ad", store.slug) ?? undefined,
          phoneToken: phoneCheck.phoneToken,
        }),
      });

      const data = await res.json().catch(() => null);
      if (data?.error?.code === "PHONE_NOT_VERIFIED") {
        // The server didn't take the token (expired, or another number): ask for a new code.
        phoneCheck.forget();
        return blockOnPhone(data.error.message ?? "Verify your phone number so the delivery partner can reach you.");
      }
      if (!res.ok || !data?.data?.order) {
        setError(data?.error?.message ?? "Something went wrong. Please try again.");
        // One page: the message (out of stock, price changed…) shows at the top of the form.
        if (!stepped) window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const order = { ...(data.data.order as CreatedOrder), paystackAccessCode: (data.data.paystack?.access_code as string | null | undefined) ?? null, deposit: (data.data.deposit as CreatedOrder["deposit"]) ?? null, podFee: Number(data.data.podFee ?? 0) || 0 };
      setCreatedOrder(order);
      rememberCartToken(store.slug, null);
      rememberBagDiscount(store.slug, null);
      // Card, and pay on delivery's delivery fee: pay with Paystack now (the button below opens it).
      if (paymentMethod === "paystack" || (order.podFee ?? 0) > 0) return;

      // Korapay: pay in the frame; the order page follows once Korapay confirms.
      const korapayUrl = paymentMethod === "korapay" ? (data.data.korapay?.checkoutUrl as string | undefined) : undefined;
      if (korapayUrl) {
        setKorapay({ orderId: order.id, checkoutUrl: korapayUrl });
        return;
      }

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

  const minimal = layout.layout === "minimal";
  const shell = (children: React.ReactNode) => (
    <ShopperShell
      theme={theme}
      storeName={store.name}
      logoUrl={store.logoUrl}
      brandSettings={store.brandSettings}
      basePath={storeBasePath}
      title="Checkout"
      footPayments={false}
      nav={showsHeaderNav(layout) ? design?.nav : undefined}
      centered={minimal}
    >
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
      <Panel theme={theme} className="mx-auto grid max-w-[640px] justify-items-center gap-3 px-6 py-14 text-center">
        <h1 className="text-[22px] font-semibold" style={{ fontFamily: theme.heading }}>Your bag is empty</h1>
        <p className="text-[15px]" style={{ color: theme.muted }}>Add something to your bag, then come back to check out.</p>
        <Link href={getPublicStorefrontPath(storeBasePath, "/")} className="mt-2 inline-flex min-h-12 items-center rounded-full px-7 text-[15px] font-semibold" style={{ background: theme.cta, color: theme.ctaText, borderRadius: theme.buttonRadius }}>Continue shopping</Link>
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
  const deliveryKnown = !stepped || stepIndex >= 1 || commerce.zones.length === 0;

  const giftNames = Object.fromEntries(store.storeProducts.map((product) => [product.id, product.name]));
  // The zones' free-delivery threshold doesn't apply to delivery partners' fees.
  const deliveryOver = partners ? null : !game.progress.enabled || game.progress.freeDelivery ? freeDeliveryEverywhereOver(info.delivery) : null;
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

  // ─── Order summary, with the blocks the seller chose ───────────────────────
  const returnsPolicy = policies.find((link) => link.key === "refund-policy");
  const summaryData = {
    trustBadges: checkoutTrustBadges(info, store.currency),
    deliveryEstimate: partners
      ? (marketOption?.estimatedDays ? deliveryEstimateText({ delivery: [] }, marketOption) : null)
      : deliveryEstimateText(info, deliveryKnown && (details.city || details.state || commerce.zones.length === 0) ? delivery.option : null),
    secureText: secureCheckoutText(info.paymentLabels),
    returnsHref: returnsPolicy ? getPublicStorefrontPath(storeBasePath, legalPagePath(returnsPolicy.key)) : null,
    whatsappHref: whatsappHelpHref(info.whatsappNumber, store.name),
  };
  const blocks = visibleSummaryBlocks(layout.summaryBlocks, {
    coupon: settings.enableCoupon && !createdOrder,
    trustEnabled: settings.enableTrustBadges,
    trustCount: summaryData.trustBadges.length,
    deliveryEstimate: summaryData.deliveryEstimate,
    whatsapp: Boolean(summaryData.whatsappHref),
    returns: Boolean(summaryData.returnsHref),
  });

  // Preorder lines with a deposit: paying by card takes the deposit (with the other lines and delivery) now and the
  // rest when it ships. Other ways to pay take the whole total.
  const deposit = createdOrder ? createdOrder.deposit ?? null : isPaystack ? liveQuote?.deposit ?? null : null;
  const depositBox = deposit ? (
    <div role="note" data-deposit className="grid gap-1.5 rounded-[14px] border p-3 text-[14px]" style={{ borderColor: theme.border, background: theme.paper }}>
      <span className="font-semibold">Pre-order deposit</span>
      <span className="flex items-baseline justify-between gap-3"><span>Pay now</span><strong className="tabular-nums">{formatStoreMoney(deposit.payNow, store.currency)}</strong></span>
      <span className="flex items-baseline justify-between gap-3" style={{ color: theme.muted }}><span>When it&apos;s ready to ship</span><span className="tabular-nums">{formatStoreMoney(deposit.balance, store.currency)}</span></span>
      <span className="text-[12.5px] leading-[1.5]" style={{ color: theme.muted }}>You pay a deposit on pre-order items now, and other items and delivery in full. We&apos;ll email you a link to pay the rest when it&apos;s ready.</span>
    </div>
  ) : null;
  const summary = (
    <OrderSummary
      theme={theme}
      currency={store.currency}
      title={layout.labels.summary}
      lines={cart.items}
      totals={totals}
      pointsAmount={liveQuote?.points?.amount ?? 0}
      rewards={rewardsBar}
      extras={<>
        {depositBox}
        {settings.enableCoupon && !createdOrder ? <WonCodeBanner storeSlug={store.slug} appliedCode={applied?.code} onApply={(value) => void applyCode(value)} colors={{ ink: theme.ink, border: theme.border, card: theme.paper, muted: theme.muted }} currency={store.currency} /> : null}
        {pointsBox}
      </>}
      deliveryKnown={partners ? Boolean(marketOption) : deliveryKnown && (commerce.zones.length === 0 || Boolean(details.city || details.state))}
      deliveryCovered={deliveryChoice.covered}
      deliveryPending={partners && hasAddress && !preview ? (marketPending ? "Checking…" : "Not available") : stepped ? "Next step" : "Add your address"}
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
      blocks={blocks}
      thumbnails={layout.thumbnails}
      data={summaryData}
      editHref={getPublicStorefrontPath(storeBasePath, "/cart")}
      accept={<WeAccept muted={theme.muted} />}
    />
  );

  // ─── Form parts ─────────────────────────────────────────────────────────────
  const contactFields = <ContactFields theme={theme} details={details} errors={errors} set={set} requirePhone={rules.requirePhone} />;
  const parcelList = <ParcelList theme={theme} parcels={parcels} currency={store.currency} />;
  // Every item ships from a supplier with its own rates: its parcels replace the store's zone options.
  const onlyParcels = !partners && parcels.lines.length > 0 && !parcels.ownItems;
  const deliveryFields = (
    <>
    <DeliveryFields
      theme={theme}
      details={details}
      errors={errors}
      set={set}
      onCountry={(value) => setDetails((prev) => ({ ...prev, country: value, state: "" }))}
      regions={regions}
      countries={[...new Set([details.country, ...COUNTRY_NAMES].filter(Boolean))]}
      areaSuggestions={[...new Set(commerce.zones.flatMap((zone) => zone.regions))]}
      hasZones={commerce.zones.length > 0}
      choice={deliveryChoice}
      selectedOptionId={delivery.option?.id ?? null}
      onSelectOption={setDeliveryOptionId}
      currency={store.currency}
      saveOnDevice={saveOnDevice}
      onSaveOnDevice={setSaveOnDevice}
      stateRequired={partners}
      partnerChoices={partners ? (<>
        <PartnerDeliveryChoices
          theme={theme}
          delivery={marketDelivery}
          pending={marketPending}
          hasAddress={hasAddress}
          selectedOptionId={delivery.option?.id ?? null}
          onSelect={(id) => {
            setDeliveryOptionId(id);
            if (errors.deliveryOption) setErrors((prev) => ({ ...prev, deliveryOption: undefined }));
          }}
          currency={store.currency}
          preview={preview}
          area={[details.city.trim(), details.state.trim()].filter(Boolean).join(", ") || null}
          storePayOnDelivery={checkoutPaymentOptions(commerce.payments, { city: details.city, state: details.state, total: totals.total, fromSuppliers }).some((option) => option.key === "pay_on_delivery")}
          payOnDelivery={commerce.payments.methods?.cod === true}
        />
        <PhoneCheck theme={theme} check={phoneCheck} />
      </>) : onlyParcels ? parcelList : null}
    />
    {onlyParcels ? null : parcelList}
    </>
  );
  // "Finish on WhatsApp" (Money page): a chat with the store, the bag already written out.
  const whatsappOrderHref = commerce.payments.methods?.wa && info.whatsappNumber && cart.items.length && !createdOrder
    ? whatsappLink(info.whatsappNumber, whatsappOrderMessage(store.name, cart.items, formatStoreMoney(totals.total, store.currency)))
    : null;
  const paymentFields = (
    <PaymentFields
      theme={theme}
      options={paymentOptions}
      method={paymentMethod}
      onSelect={setChosenMethod}
      unavailable={noWayToPay}
      errors={errors}
      // One page: the contact phone field is on screen already (and pay on delivery errors show there).
      riderPhone={stepped ? <TextField theme={theme} id="co-phone" label="Phone number for the rider" type="tel" inputMode="tel" value={details.phone} onChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" /> : null}
      total={totals.total}
      currency={store.currency}
      whatsappOrderHref={whatsappOrderHref}
    />
  );
  const showNote = settings.enableNotes && layout.orderNote;
  const extrasFields = showNote || settings.enableGiftNote || (upsells.length && !createdOrder) ? (
    <div className="grid gap-4">
      {showNote ? (
        <TextAreaField theme={theme} id="co-notes" label="Order note (optional)" value={notes} onChange={setNotes} hint="Anything the store should know, like a good time to deliver." disabled={Boolean(createdOrder)} />
      ) : null}
      {settings.enableGiftNote ? (
        <TextAreaField theme={theme} id="co-gift" label="Gift message (optional)" value={giftMessage} onChange={setGiftMessage} hint="The store will include it with your order." disabled={Boolean(createdOrder)} />
      ) : null}
      {upsells.length && !createdOrder ? (
        <section aria-labelledby="co-upsell" className="grid gap-2">
          <h3 id="co-upsell" className="text-[15px] font-semibold">Add to your order</h3>
          <ul className="m-0 grid list-none gap-2 p-0">
            {upsells.map((product) => (
              <li key={product.id} className="flex items-center gap-3 rounded-[14px] border p-2.5" style={{ borderColor: theme.border }}>
                <ItemThumb theme={theme} src={product.images[0]} alt="" size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{product.name}</span>
                  <span className="block text-[13px]" style={{ color: theme.muted }}>{formatStoreMoney(product.retailPrice, store.currency)}</span>
                </span>
                <SecondaryButton theme={theme} type="button" onClick={() => (needsOptions(product) ? router.push(getPublicStorefrontPath(storeBasePath, `/product/${product.id}`)) : cart.add({ productId: product.id, name: product.name, price: product.retailPrice, image: product.images[0] }))} aria-label={`Add ${product.name} to your order`}>
                  <Icon name="plus" size={14} /> Add
                </SecondaryButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  ) : null;

  const finalLabel = podFeeNow > 0 && !layout.labels.placeOrder
    ? `Pay ${formatStoreMoney(podFeeNow, store.currency)} delivery now`
    : placeOrderLabel(layout, { paystack: isPaystack || paymentMethod === "korapay", total: deposit ? deposit.payNow : totals.total, currency: store.currency });
  const nextStep = stepped ? steps[stepIndex + 1] : undefined;
  const actions = (
    <div className="mt-6 flex flex-col-reverse gap-3 @2xl:flex-row @2xl:items-center">
      {stepped && stepIndex > 0 && !createdOrder ? (
        <SecondaryButton theme={theme} type="button" onClick={() => goTo(stepIndex - 1)} className="@2xl:min-w-[120px]">
          <Icon name="arrowLeft" size={15} /> Back
        </SecondaryButton>
      ) : !createdOrder && !minimal ? (
        <Link href={getPublicStorefrontPath(storeBasePath, "/cart")} className="inline-flex min-h-11 items-center justify-center gap-2 text-[14px] font-medium underline underline-offset-4">
          Back to bag
        </Link>
      ) : null}
      <div className={minimal && !stepped ? "w-full" : "@2xl:ml-auto @2xl:min-w-[260px]"}>
        {finalStep && preview ? (
          <button
            type="button"
            disabled
            aria-describedby="co-preview-note"
            className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border-2 border-dashed px-6 text-[15px] font-semibold"
            style={{ borderColor: theme.border, color: theme.muted, background: theme.paper }}
          >
            <Icon name="lock" size={16} /> Checkout is off in preview
          </button>
        ) : finalStep && createdOrder && paysNow ? (
          <PaystackCheckoutButton
            accessCode={createdOrder.paystackAccessCode}
            amount={podFeeNow > 0 ? podFeeNow : createdOrder.deposit ? createdOrder.deposit.payNow : createdOrder.total}
            email={details.email}
            firstName={nameParts[0]}
            lastName={nameParts.slice(1).join(" ")}
            phone={details.phone}
            metadata={{ orderId: createdOrder.id, orderNumber: createdOrder.orderNumber }}
            onSuccess={handlePaymentSuccess}
            onClose={() => setPayClosed(true)}
            disabled={paying}
            label={paying ? "Confirming payment…" : podFeeNow > 0 ? `Pay ${formatStoreMoney(podFeeNow, createdOrder.currency)} delivery now` : `Pay ${formatStoreMoney(createdOrder.deposit ? createdOrder.deposit.payNow : createdOrder.total, createdOrder.currency)}${createdOrder.deposit ? " deposit" : ""}`}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-[16px] font-semibold disabled:opacity-60"
            style={{ background: theme.cta, color: theme.ctaText, border: "none", borderRadius: theme.buttonRadius }}
          />
        ) : (
          <PrimaryButton theme={theme} type="submit" disabled={submitting || (finalStep && (Boolean(quoteError) || Boolean(noWayToPay)))} className="w-full">
            {finalStep
              ? submitting
                ? "Placing order…"
                : <>{isPaystack ? <Icon name="lock" size={16} /> : null} {finalLabel}</>
              : <>{continueLabel(layout, nextStep)} <Icon name="arrow" size={15} /></>}
          </PrimaryButton>
        )}
      </div>
    </div>
  );
  const afterActions = finalStep ? (
    <>
      {preview ? (
        <div id="co-preview-note" className="mt-4 rounded-[14px] border border-dashed px-4 py-3 text-[13.5px] leading-6" style={{ borderColor: theme.border, background: theme.paper }}>
          <p className="m-0 font-semibold">This is where shoppers pay.</p>
          <p className="m-0 mt-1" style={{ color: theme.muted }}>
            Once your store is live, this button reads{" "}
            <strong style={{ color: theme.ink }}>{finalLabel}</strong>. In preview nothing is charged and no order is created.
            To try a real test order, go live, place one with pay on delivery or bank transfer, then cancel it from Orders.
          </p>
        </div>
      ) : null}
      {policies.length ? (
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
      {createdOrder && paysNow ? (
        <p className="mt-3 text-[13.5px]" style={{ color: theme.muted }} role="status">
          Order {createdOrder.orderNumber} is saved. {payClosed ? "The payment window closed before you paid. " : ""}Tap pay to finish with Paystack.
        </p>
      ) : null}
    </>
  ) : null;

  const banners = (
    <>
      {preview ? <Banner theme={theme} tone="info">Test run: fill in anything you like. Nothing is charged and no order is created in preview.</Banner> : null}
      {error ? <Banner theme={theme} tone="error">{error}</Banner> : null}
      {quoteError && !error ? <Banner theme={theme} tone="error">{quoteError} <Link href={getPublicStorefrontPath(storeBasePath, "/cart")} className="font-semibold underline underline-offset-4">Edit bag</Link></Banner> : null}
      <ErrorSummary text={errorNote} />
    </>
  );

  // A partner's doorstep option names the partner (or the seller's label) as shown at checkout.
  const optionName = marketOption && isPartnerOption(marketOption) && marketOption.kind !== "pickup_point" && marketOption.kind !== "multi" && marketOption.detail
    ? `${marketOption.name} (${marketOption.detail})`
    : delivery.option?.name ?? "";
  const deliveryLine = delivery.option
    ? `${optionName} · ${totals.shippingFee - totals.deliveryDiscount > 0 ? formatStoreMoney(totals.shippingFee - totals.deliveryDiscount, store.currency) : "Free"}${delivery.option.estimatedDays ? ` · ${delivery.option.estimatedDays}` : ""}`
    : partners ? marketProblem ?? "" : deliveryChoice.covered ? "Free delivery" : "The store will confirm delivery with you";

  const form = stepped && step ? (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (finalStep) void placeOrder();
        else next();
      }}
    >
      <Panel theme={theme} className="p-5 sm:p-6">
        <h1 ref={headingRef} tabIndex={-1} className="mb-1 text-[22px] font-semibold outline-none" style={{ fontFamily: theme.heading }}>{LAYOUT_STEP_TITLES[step].title}</h1>
        <p className="mb-5 text-[14px]" style={{ color: theme.muted }}>{LAYOUT_STEP_TITLES[step].sub}</p>
        {step === "contact" ? contactFields : null}
        {step === "delivery" ? deliveryFields : null}
        {step === "payment" ? (
          <div className="grid gap-4">
            <ReviewBlock theme={theme} title="Contact" onEdit={createdOrder ? undefined : () => goTo(0)}>
              {details.name}<br />{details.email}{details.phone ? <><br />{details.phone}</> : null}
            </ReviewBlock>
            <ReviewBlock theme={theme} title="Delivery" onEdit={createdOrder ? undefined : () => goTo(1)}>
              {[details.street, details.city, details.state, details.country].filter(Boolean).join(", ")}
              {details.landmark ? <><br />Near {details.landmark}</> : null}
              <br />
              <span style={{ color: theme.muted }}>{deliveryLine}</span>
            </ReviewBlock>
            <fieldset disabled={Boolean(createdOrder)} className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-2 p-0 text-[15px] font-semibold">Payment</legend>
              {paymentFields}
            </fieldset>
            {extrasFields}
          </div>
        ) : null}
        {actions}
        {afterActions}
      </Panel>
    </form>
  ) : (
    <form
      noValidate
      aria-labelledby="co-title"
      onSubmit={(event) => {
        event.preventDefault();
        void placeOrder();
      }}
    >
      <fieldset disabled={Boolean(createdOrder)} className={`m-0 grid min-w-0 border-0 p-0 ${minimal ? "gap-6" : "gap-5"}`}>
        <FormSection theme={theme} flat={minimal} id="co-contact" title={CHECKOUT_STEP_LABELS.contact} sub="No account needed. We'll send your receipt and order updates here.">{contactFields}</FormSection>
        <FormSection theme={theme} flat={minimal} id="co-delivery" title={CHECKOUT_STEP_LABELS.delivery} sub="Your address and how you'd like to get your order.">{deliveryFields}</FormSection>
        <FormSection theme={theme} flat={minimal} id="co-payment" title={CHECKOUT_STEP_LABELS.payment} sub="These are the ways this store accepts.">{paymentFields}</FormSection>
        {extrasFields ? <FormSection theme={theme} flat={minimal} id="co-extras" title="Anything else?">{extrasFields}</FormSection> : null}
      </fieldset>
      {actions}
      {afterActions}
    </form>
  );

  const korapayFrame = korapay ? (
    <KorapayFrame
      orderId={korapay.orderId}
      checkoutUrl={korapay.checkoutUrl}
      onPaid={() => {
        cart.clear();
        router.push(getPublicStorefrontPath(storeBasePath, `/order/${korapay.orderId}`));
      }}
      onClose={() => {
        // Not paid (yet): the order page waits for Korapay and updates once it confirms.
        cart.clear();
        router.push(getPublicStorefrontPath(storeBasePath, `/order/${korapay.orderId}`));
      }}
    />
  ) : null;

  return shell(
    <>{korapayFrame}<CheckoutFrame theme={theme} settings={layout} summary={summary} summaryOpen={summaryOpen} onToggleSummary={() => setSummaryOpen((open) => !open)} total={totals.total} currency={store.currency}>
      {stepped ? (
        <StepProgress
          theme={theme}
          steps={steps.map((entry) => ({ id: entry, label: CHECKOUT_STEP_LABELS[entry] }))}
          current={stepIndex}
          reached={reached}
          onSelect={(index) => !createdOrder && goTo(index)}
        />
      ) : (
        <h1 id="co-title" className={`mb-4 text-[26px] font-semibold leading-tight ${minimal ? "text-center" : ""}`} style={{ fontFamily: theme.heading }}>Checkout</h1>
      )}
      <CheckoutMessage theme={theme} text={layout.message} />
      {banners}
      {form}
    </CheckoutFrame></>,
  );
}
