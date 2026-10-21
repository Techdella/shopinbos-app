"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { KorapayFrame } from "@/components/payments/KorapayFrame";
import { formatStoreMoney } from "@/lib/storefront/shopper-info";
import { channelFromRef } from "@shared/channels";
import { checkoutPaymentOptions, noWayToPayText, type CheckoutPaymentMethod } from "@shared/checkout-payments";
import { chooseDelivery, deliveryOptionsFor, isEmail, isPhone, orderTotals, type OrderTotals } from "@shared/cart-checkout";
import { countryName, readSavedDetails, regionsFor, saveDetails } from "@/components/storefront/shopper/checkout-storage";
import { ItemThumb, Panel, PrimaryButton, QuantityStepper, ShopperShell, fieldClass } from "@/components/storefront/shopper/ShopperShell";
import { WeAccept } from "@/components/storefront/shopper/StoreFooterBadges";
import { resolveShopperTheme, type ShopperTheme } from "@/components/storefront/shopper/theme";
import type { ShopperCommerce, ShopperStore } from "@/components/storefront/shopper/types";
import { TransferInstructions, type TransferDetails } from "../../order/[orderId]/TransferInstructions";
import type { PublicPayLink } from "@/lib/payment-links/public.server";
import { PartnerDeliveryChoices, hasPartnerParcels, partnerDeliveryProblem, partnerPaymentOptions, readQuotedDelivery, type QuotedDelivery } from "@/components/storefront/checkout/PartnerDelivery";
import { PhoneCheck, usePhoneCheck } from "@/components/storefront/checkout/PhoneCheck";

// The page a customer opens from a payment link in WhatsApp, Instagram or TikTok: what they're paying for, a size or
// colour if the seller left it open, how many (when allowed), delivery from the store's zones (or the delivery partners'
// options the server quotes for the address, when the seller uses delivery partners) and the store's ways to pay. Totals come from the server (the same quote checkout charges); paying goes through the normal checkout.
// Storefront pages are in English, like the rest of the store.

interface Props {
  store: ShopperStore;
  storeBasePath: string;
  commerce: ShopperCommerce;
  preview?: boolean;
  link: PublicPayLink;
}

interface Details {
  name: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  country: string;
  landmark: string;
}

type Errors = Partial<Record<keyof Details | "option" | "delivery", string>>;

export function PayLinkClient({ store, storeBasePath, commerce, preview = false, link }: Props) {
  const router = useRouter();
  const theme = useMemo(() => resolveShopperTheme(store.brandSettings), [store.brandSettings]);
  const money = (amount: number) => formatStoreMoney(amount, store.currency);
  const storeHome = getPublicStorefrontPath(storeBasePath, "/");
  const shell = (children: React.ReactNode) => (
    <ShopperShell theme={theme} storeName={store.name} logoUrl={store.logoUrl} brandSettings={store.brandSettings} basePath={storeBasePath} title="Pay" footPayments={false}>
      <div className="mx-auto w-full max-w-[560px]">{children}</div>
    </ShopperShell>
  );

  if (link.status !== "active") return shell(<Closed theme={theme} link={link} storeName={store.name} storeHome={storeHome} storeBasePath={storeBasePath} money={money} />);
  return shell(<PayForm theme={theme} link={link} store={store} commerce={commerce} preview={preview} storeBasePath={storeBasePath} money={money} onPlaced={(path) => router.push(path)} />);
}

function Closed({ theme, link, storeName, storeHome, storeBasePath, money }: { theme: ShopperTheme; link: PublicPayLink; storeName: string; storeHome: string; storeBasePath: string; money: (n: number) => string }) {
  if (link.status === "paid") {
    const order = link.paidOrder;
    const onDelivery = order?.paymentMethod === "pay_on_delivery";
    return (
      <Panel theme={theme} className="p-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: theme.cta, color: theme.ctaText }}><Icon name="check" size={26} /></span>
        <h1 className="mt-4 text-[26px] font-semibold" style={{ fontFamily: theme.heading }}>{onDelivery ? "Order placed. Thank you!" : "Paid. Thank you!"}</h1>
        <p className="mt-1.5 text-[15px]" style={{ color: theme.muted }}>{onDelivery ? `${storeName} has your order. Pay the rider when it arrives.` : `${storeName} has your payment and will send your order.`}</p>
        {order ? (
          <div className="mt-5 text-left">
            <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: theme.muted }}>Order {order.orderNumber}</p>
            <ul className="mt-2 divide-y" style={{ borderColor: theme.border }}>
              {order.items.map((item, index) => (
                <li key={index} className="flex justify-between gap-3 py-2 text-[15px]">
                  <span className="min-w-0">{item.quantity} × {item.name}</span>
                  <span className="shrink-0 font-semibold">{money(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t pt-3 text-[16px] font-semibold" style={{ borderColor: theme.border }}>
              <span>Total</span>
              <span>{money(order.total)}</span>
            </div>
            <Link href={getPublicStorefrontPath(storeBasePath, `/order/${order.id}`)} className="mt-4 inline-block text-[15px] font-semibold underline underline-offset-4">View your order</Link>
          </div>
        ) : null}
      </Panel>
    );
  }
  return (
    <Panel theme={theme} className="p-6 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full" style={{ background: theme.border }}><Icon name="clock" size={24} /></span>
      <h1 className="mt-4 text-[24px] font-semibold" style={{ fontFamily: theme.heading }}>{link.status === "expired" ? "This link has expired" : "This link is no longer available"}</h1>
      <p className="mt-1.5 text-[15px]" style={{ color: theme.muted }}>Message {storeName} for a new payment link, or shop from their store.</p>
      <Link href={storeHome} className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[15px] font-semibold" style={{ background: theme.cta, color: theme.ctaText, borderRadius: theme.buttonRadius }}>
        Visit {storeName}
      </Link>
    </Panel>
  );
}

function PayForm({ theme, link, store, commerce, preview, storeBasePath, money, onPlaced }: {
  theme: ShopperTheme;
  link: PublicPayLink;
  store: ShopperStore;
  commerce: ShopperCommerce;
  preview: boolean;
  storeBasePath: string;
  money: (n: number) => string;
  onPlaced: (path: string) => void;
}) {
  const single = link.items.length === 1 ? link.items[0] : null;
  const needsOption = Boolean(single && single.options.length > 0);
  const [optionId, setOptionId] = useState<string | null>(single && single.options.length === 1 ? single.options[0].id : null);
  const [quantity, setQuantity] = useState(single ? single.quantity : 1);
  const [details, setDetails] = useState<Details>({ name: link.prefill.name, phone: link.prefill.phone, email: link.prefill.email, street: "", city: "", state: "", country: countryName(store.country), landmark: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [deliveryOptionId, setDeliveryOptionId] = useState<string | null>(null);
  const [chosenMethod, setChosenMethod] = useState<CheckoutPaymentMethod | null>(null);
  const [quote, setQuote] = useState<{ key: string; totals: OrderTotals } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Delivery partners: the options the server quoted for the choices and address in `key`.
  const [market, setMarket] = useState<{ key: string; value: QuotedDelivery | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<{ orderId: string; details: TransferDetails } | null>(null);
  const [korapay, setKorapay] = useState<{ orderId: string; checkoutUrl: string } | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const regions = regionsFor(details.country);
  const unavailable = link.items.some((item) => !item.available);

  // Saved details from an earlier checkout on this device fill what the link didn't; ?ref= says which app sent them.
  useEffect(() => {
    const saved = readSavedDetails(store.slug);
    setDetails((prev) => ({
      ...prev,
      name: prev.name || saved.name || "",
      phone: prev.phone || saved.phone || "",
      email: prev.email || saved.email || "",
      street: saved.street || "",
      city: saved.city || "",
      state: saved.state || "",
      country: saved.country || prev.country,
      landmark: saved.landmark || "",
    }));
    try {
      const params = new URLSearchParams(window.location.search);
      setRef(channelFromRef(params.get("ref") ?? params.get("utm_source")));
    } catch {}
  }, [store.slug]);

  const chosenOption = single?.options.find((option) => option.id === optionId) ?? null;
  const unitPrice = chosenOption?.price ?? single?.price ?? 0;
  const itemsTotal = link.customAmount ?? (single ? unitPrice * quantity : link.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const address = { city: details.city, state: details.state };
  const partners = commerce.deliveryMode === "partners";
  const hasAddress = Boolean(details.city.trim() || details.state.trim());
  const marketKey = JSON.stringify([optionId, quantity, details.city, details.state]);
  const liveMarket = partners && market && market.key === marketKey ? market : null;
  const marketPending = partners && !preview && hasAddress && !liveMarket;
  const marketDelivery = liveMarket?.value ?? null;
  const deliveryChoice = partners
    ? { covered: marketDelivery?.covered ?? true, options: marketDelivery?.options ?? [] }
    : deliveryOptionsFor(commerce.zones, commerce.flatRate, address, itemsTotal);
  const delivery = chooseDelivery(deliveryChoice, deliveryOptionId);
  const marketOption = partners ? marketDelivery?.options.find((option) => option.id === delivery.option?.id) ?? null : null;
  const marketProblem = partners && !preview ? partnerDeliveryProblem({ hasAddress, pending: marketPending, delivery: marketDelivery }) : null;
  // A delivery partner's rider needs a verified phone (spec §6.1): same check as checkout (PhoneCheck.tsx).
  const phoneCheck = usePhoneCheck({ storeSlug: store.slug, phone: details.phone, enabled: partners && !preview, needed: hasPartnerParcels(marketOption) });
  const estimate = orderTotals({ subtotal: itemsTotal, shippingFee: delivery.fee });
  const quoteKey = JSON.stringify([optionId, quantity, details.city, details.state, partners ? deliveryOptionId : delivery.option?.id ?? null]);
  const totals = quote && quote.key === quoteKey ? quote.totals : estimate;

  const paymentOptions = useMemo(() => {
    const context = { city: details.city, state: details.state, total: totals.total };
    // With delivery partners, pay on delivery goes with the chosen option (as the checkout API checks it).
    return partners ? partnerPaymentOptions(commerce.payments, context, marketOption) : checkoutPaymentOptions(commerce.payments, context);
  }, [partners, marketOption, commerce.payments, details.city, details.state, totals.total]);
  const noWayToPay = paymentOptions.length === 0 ? noWayToPayText(commerce.payments, { city: details.city, state: details.state, total: totals.total }) : null;
  const paymentMethod: CheckoutPaymentMethod = paymentOptions.some((option) => option.key === chosenMethod) ? chosenMethod! : paymentOptions[0]?.key ?? "transfer";

  // The server's totals for the same choices (delivery, options, agreed amount): what checkout will charge.
  useEffect(() => {
    if (preview || unavailable || (needsOption && !optionId)) return;
    if ((commerce.zones.length > 0 || partners) && !details.city && !details.state) return;
    const key = quoteKey;
    const deliveryKey = marketKey;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/public/store/${encodeURIComponent(store.slug)}/checkout/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ paymentLinkCode: link.code, linkVariantId: optionId ?? undefined, linkQuantity: link.buyerSetsQuantity ? quantity : undefined, address, deliveryOptionId: (partners ? deliveryOptionId : delivery.option?.id) ?? undefined }),
      })
        .then(async (res) => {
          const json = await res.json().catch(() => null);
          if (!res.ok) {
            if (partners) setMarket({ key: deliveryKey, value: null });
            return setQuoteError(json?.error?.message ?? null);
          }
          setQuoteError(null);
          setQuote({ key, totals: json.data.totals as OrderTotals });
          if (partners) setMarket({ key: deliveryKey, value: readQuotedDelivery(json.data?.delivery) });
        })
        .catch(() => {});
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  function set<K extends keyof Details>(field: K, value: string) {
    setDetails((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate(): Errors {
    const found: Errors = {};
    if (needsOption && !optionId) found.option = "Choose an option.";
    if (!details.name.trim()) found.name = "Enter your name.";
    if (!isPhone(details.phone)) found.phone = "Enter a phone number the rider can call.";
    if (details.email.trim() ? !isEmail(details.email) : (paymentMethod === "paystack" || paymentMethod === "korapay")) found.email = details.email.trim() ? "Enter a valid email." : "Add your email to pay by card. We send the receipt there.";
    if (!details.street.trim()) found.street = "Enter your street address.";
    if (!details.city.trim()) found.city = "Enter your area or city.";
    if ((regions.length > 0 || partners) && !details.state.trim()) found.state = "Choose your state.";
    if (marketProblem && !found.city && !found.state) found.delivery = marketProblem;
    return found;
  }

  /** The phone isn't verified yet: say so in the phone box and move focus there. */
  function blockOnPhone(message: string) {
    phoneCheck.showError(message);
    window.requestAnimationFrame(() => document.getElementById("pay-phone-check")?.focus());
  }

  async function pay() {
    setError(null);
    if (preview) return setError("This is your preview. Customers pay here once the store is live.");
    if (noWayToPay) return setError(noWayToPay);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      const first = Object.keys(found)[0];
      window.requestAnimationFrame(() => document.getElementById(`pay-${first}`)?.focus());
      return;
    }
    // Delivery partners: no order until the phone took its code (the checkout API checks the token too).
    if (phoneCheck.blocker) return blockOnPhone(phoneCheck.blocker);
    saveDetails(store.slug, { name: details.name.trim(), phone: details.phone.trim(), email: details.email.trim(), street: details.street.trim(), city: details.city.trim(), state: details.state.trim(), country: details.country.trim(), landmark: details.landmark.trim() });
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(store.slug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentLinkCode: link.code,
          linkVariantId: optionId ?? undefined,
          linkQuantity: link.buyerSetsQuantity ? quantity : undefined,
          items: [],
          buyerName: details.name.trim(),
          buyerEmail: details.email.trim(),
          buyerPhone: details.phone.trim(),
          deliveryAddress: { street: details.street.trim(), city: details.city.trim(), state: details.state.trim() || undefined, country: details.country.trim() || undefined, landmark: details.landmark.trim() || undefined },
          deliveryOptionId: delivery.option?.id,
          paymentMethod,
          channel: ref ?? undefined,
          phoneToken: phoneCheck.phoneToken,
        }),
      });
      const json = await res.json().catch(() => null);
      if (json?.error?.code === "PHONE_NOT_VERIFIED") {
        // The server didn't take the token (expired, or another number): ask for a new code.
        phoneCheck.forget();
        return blockOnPhone(json.error.message ?? "Verify your phone number so the delivery partner can reach you.");
      }
      if (!res.ok || !json?.data?.order) {
        setError(json?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      const order = json.data.order as { id: string };
      if (paymentMethod === "paystack") {
        // The server started the transaction (split to the seller's own bank); Paystack's popup opens it here.
        const accessCode = json.data.paystack?.access_code as string | undefined;
        const url = json.data.paystack?.authorization_url as string | undefined;
        const orderPath = getPublicStorefrontPath(storeBasePath, `/order/${order.id}`);
        if (accessCode) {
          const { default: PaystackPop } = await import("@paystack/inline-js");
          new PaystackPop().resumeTransaction(accessCode, {
            // The order page confirms the payment with Paystack before marking it paid.
            onSuccess: (transaction) => onPlaced(`${orderPath}?reference=${encodeURIComponent(transaction.reference)}`),
            onCancel: () => onPlaced(orderPath),
          });
          return;
        }
        if (url) {
          window.location.href = url;
          return;
        }
        setError("Card payment isn't available right now. Choose another way to pay, or message the store.");
        return;
      }
      if (paymentMethod === "korapay") {
        const checkoutUrl = json.data.korapay?.checkoutUrl as string | undefined;
        if (checkoutUrl) {
          setKorapay({ orderId: order.id, checkoutUrl });
          return;
        }
        setError("Korapay isn't available right now. Choose another way to pay, or message the store.");
        return;
      }
      if (paymentMethod === "transfer" && json.data.transfer) {
        setTransfer({ orderId: order.id, details: json.data.transfer as TransferDetails });
        window.scrollTo({ top: 0 });
        return;
      }
      onPlaced(getPublicStorefrontPath(storeBasePath, `/order/${order.id}`));
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (korapay) {
    const done = () => onPlaced(getPublicStorefrontPath(storeBasePath, `/order/${korapay.orderId}`));
    return <KorapayFrame orderId={korapay.orderId} checkoutUrl={korapay.checkoutUrl} onPaid={done} onClose={done} />;
  }

  if (transfer) {
    return (
      <div className="grid gap-5">
        <h1 className="text-[26px] font-semibold" style={{ fontFamily: theme.heading }}>Your order is placed</h1>
        <TransferInstructions orderId={transfer.orderId} currency={store.currency} details={transfer.details} ctaBg={theme.cta} ctaText={theme.ctaText} />
        <Link href={getPublicStorefrontPath(storeBasePath, `/order/${transfer.orderId}`)} className="justify-self-center py-2 text-[15px] font-semibold underline underline-offset-4">View your order</Link>
      </div>
    );
  }

  const photo = chosenOption?.imageUrl ?? link.items[0]?.images[0] ?? null;
  const field = (key: keyof Details, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block text-[14px] font-medium">
      {label}
      <input id={`pay-${key}`} value={details[key]} onChange={(event) => set(key, event.target.value)} aria-invalid={Boolean(errors[key])} className={fieldClass} style={{ borderColor: errors[key] ? "#C2412D" : theme.border }} {...props} />
      {errors[key] ? <span className="mt-1 block text-[13px]" style={{ color: "#C2412D" }}>{errors[key]}</span> : null}
    </label>
  );

  return (
    <div className="grid gap-4">
      <Panel theme={theme} className="overflow-hidden">
        {photo ? <img src={photo} alt={link.title} className="aspect-square w-full object-cover sm:aspect-[4/3]" /> : null}
        <div className="p-5">
          <p className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: theme.muted }}>Pay {store.name}</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight" style={{ fontFamily: theme.heading }}>{link.title}</h1>
          {link.note ? <p className="mt-2 whitespace-pre-line text-[15px]" style={{ color: theme.muted }}>{link.note}</p> : null}

          {link.items.length > 1 ? (
            <ul className="mt-4 grid gap-3">
              {link.items.map((item) => (
                <li key={`${item.productId}:${item.variantId ?? ""}`} className="flex items-center gap-3">
                  <ItemThumb theme={theme} src={item.images[0]} alt={item.name} size={56} />
                  <span className="min-w-0 flex-1 text-[15px]">{item.quantity} × {item.name}{item.variant ? ` · ${item.variant}` : ""}</span>
                  {link.customAmount == null ? <span className="text-[15px] font-semibold">{money(item.price * item.quantity)}</span> : null}
                </li>
              ))}
            </ul>
          ) : single?.variant ? (
            <p className="mt-2 text-[15px]">Option: <strong>{single.variant}</strong></p>
          ) : null}

          {needsOption && single ? (
            <fieldset className="mt-4">
              <legend className="text-[14px] font-medium">Choose an option</legend>
              <div className="mt-2 flex flex-wrap gap-2" id="pay-option" tabIndex={-1}>
                {single.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!option.available}
                    aria-pressed={optionId === option.id}
                    onClick={() => {
                      setOptionId(option.id);
                      setErrors((prev) => ({ ...prev, option: undefined }));
                    }}
                    className="min-h-11 rounded-full border px-4 text-[14px] font-medium disabled:opacity-40"
                    style={{ borderColor: optionId === option.id ? theme.ink : theme.border, background: optionId === option.id ? theme.ink : theme.surface, color: optionId === option.id ? theme.paper : theme.ink }}
                  >
                    {option.name}{option.price !== single.price ? ` · ${money(option.price)}` : ""}
                  </button>
                ))}
              </div>
              {errors.option ? <span className="mt-1 block text-[13px]" style={{ color: "#C2412D" }}>{errors.option}</span> : null}
            </fieldset>
          ) : null}

          {single && link.buyerSetsQuantity ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[14px] font-medium">How many</span>
              <QuantityStepper theme={theme} value={quantity} max={link.maxQuantity} label={single.name} onChange={(next) => setQuantity(Math.min(Math.max(1, next), link.maxQuantity))} />
            </div>
          ) : single && !link.buyerSetsQuantity && single.quantity > 1 ? (
            <p className="mt-2 text-[15px]">Quantity: <strong>{single.quantity}</strong></p>
          ) : null}

          <p className="mt-4 text-[22px] font-semibold">{money(itemsTotal)}</p>
        </div>
      </Panel>

      {unavailable ? (
        <Panel theme={theme} className="p-5 text-[15px]">Something on this link is no longer available. Message {store.name} for a new link.</Panel>
      ) : (
        <>
          <Panel theme={theme} className="grid gap-3 p-5">
            <h2 className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>Your details</h2>
            {field("name", "Full name", { autoComplete: "name" })}
            {field("phone", "Phone (WhatsApp)", { type: "tel", autoComplete: "tel", inputMode: "tel" })}
            {field("email", paymentMethod === "paystack" ? "Email (for your receipt)" : "Email (optional)", { type: "email", autoComplete: "email" })}
          </Panel>

          <Panel theme={theme} className="grid gap-3 p-5">
            <h2 className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>Delivery</h2>
            {field("street", "Street address", { autoComplete: "street-address" })}
            {field("city", "Area or city", { autoComplete: "address-level2" })}
            {regions.length > 0 ? (
              <label className="block text-[14px] font-medium">
                State
                <select id="pay-state" value={details.state} onChange={(event) => set("state", event.target.value)} className={fieldClass} style={{ borderColor: errors.state ? "#C2412D" : theme.border }}>
                  <option value="">Choose your state</option>
                  {regions.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
                {errors.state ? <span className="mt-1 block text-[13px]" style={{ color: "#C2412D" }}>{errors.state}</span> : null}
              </label>
            ) : partners ? field("state", "State", { autoComplete: "address-level1" }) : null}
            {field("landmark", "Landmark (optional)")}
            {partners ? (
              <>
                <PartnerDeliveryChoices
                  theme={theme}
                  delivery={marketDelivery}
                  pending={marketPending}
                  hasAddress={hasAddress}
                  selectedOptionId={delivery.option?.id ?? null}
                  onSelect={(id) => {
                    setDeliveryOptionId(id);
                    setErrors((prev) => ({ ...prev, delivery: undefined }));
                  }}
                  currency={store.currency}
                  preview={preview}
                  payOnDelivery={commerce.payments.methods?.cod === true}
                  name="delivery"
                  id="pay-delivery"
                />
                {errors.delivery && marketDelivery?.covered !== false ? <span className="block text-[13px]" style={{ color: "#C2412D" }}>{errors.delivery}</span> : null}
                <PhoneCheck theme={theme} check={phoneCheck} id="pay-phone-check" />
              </>
            ) : deliveryChoice.options.length > 1 ? (
              <div className="grid gap-2" role="radiogroup" aria-label="Delivery option">
                {deliveryChoice.options.map((option) => (
                  <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border px-4" style={{ borderColor: delivery.option?.id === option.id ? theme.ink : theme.border }}>
                    <input type="radio" name="delivery" checked={delivery.option?.id === option.id} onChange={() => setDeliveryOptionId(option.id)} />
                    <span className="min-w-0 flex-1 text-[15px]">{option.name}{option.estimatedDays ? ` · ${option.estimatedDays}` : ""}</span>
                    <span className="text-[15px] font-semibold">{option.price ? money(option.price) : "Free"}</span>
                  </label>
                ))}
              </div>
            ) : null}
            {!partners && !deliveryChoice.covered && (details.city || details.state) ? <p className="text-[14px]" style={{ color: theme.muted }}>The store will confirm delivery to this address with you.</p> : null}
          </Panel>

          <Panel theme={theme} className="grid gap-3 p-5">
            <h2 className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>How you'll pay</h2>
            <div className="grid gap-2" role="radiogroup" aria-label="Payment method">
              {paymentOptions.map((option) => (
                <label key={option.key} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-2" style={{ borderColor: paymentMethod === option.key ? theme.ink : theme.border }}>
                  <input type="radio" name="payment" checked={paymentMethod === option.key} onChange={() => setChosenMethod(option.key)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{option.label}</span>
                    <span className="block text-[13px]" style={{ color: theme.muted }}>{option.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {noWayToPay && !error ? <p role="alert" className="text-[14px]" style={{ color: "#C2412D" }}>{noWayToPay}</p> : null}
            <dl className="mt-1 grid gap-1.5 text-[15px]">
              <div className="flex justify-between"><dt>Items</dt><dd>{money(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt>Delivery</dt><dd>{partners && !marketOption ? <span style={{ color: theme.muted }}>{marketPending ? "Checking…" : hasAddress ? "Not available" : "Add your address"}</span> : totals.shippingFee ? money(totals.shippingFee) : "Free"}</dd></div>
              {totals.discountAmount ? <div className="flex justify-between"><dt>Discount</dt><dd>−{money(totals.discountAmount)}</dd></div> : null}
              <div className="flex justify-between border-t pt-2 text-[18px] font-semibold" style={{ borderColor: theme.border }}><dt>Total</dt><dd>{money(totals.total)}</dd></div>
            </dl>
            {quoteError ? <p role="alert" className="text-[14px]" style={{ color: "#C2412D" }}>{quoteError}</p> : null}
            {error ? <p role="alert" className="text-[14px]" style={{ color: "#C2412D" }}>{error}</p> : null}
            <PrimaryButton theme={theme} type="button" onClick={pay} disabled={submitting || Boolean(noWayToPay)} className="w-full">
              {submitting ? "Please wait…" : paymentMethod === "paystack" || paymentMethod === "korapay" ? `Pay ${money(totals.total)}` : "Place order"}
            </PrimaryButton>
            <p className="flex items-center justify-center gap-1.5 text-[13px]" style={{ color: theme.muted }}><Icon name="lock" size={13} /> Secure payment. {store.name} gets your order straight away.</p>
            <WeAccept muted={theme.muted} className="justify-center" />
          </Panel>
        </>
      )}
    </div>
  );
}
