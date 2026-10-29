"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type React from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/hooks/useCart";
import { useWishlist } from "@/hooks/useWishlist";
import { rememberStoreVisitor, useStoreVisitBeacon } from "@/hooks/useStoreVisitor";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { formatStoreMoney, freeDeliveryEverywhereOver, readShopperInfo, summariseDeliveryZones } from "@/lib/storefront/shopper-info";
import { matchZone } from "@shared/checkout-payments";
import { discountAmount } from "@/lib/discounts";
import {
  chooseDelivery,
  deliveryOptionsFor,
  lineKey,
  orderTotals,
  suggestProducts,
  type CartLine,
} from "@shared/cart-checkout";
import { needsOptions, readVariants } from "./catalog";
import { readGameConfig } from "@/lib/gamification/logic";
import { RewardProgress } from "@/components/storefront/gamification/RewardProgress";
import { WonCodeBanner } from "@/components/storefront/gamification/Rewards";
import { rememberCartToken } from "./cart-capture";
import {
  checkDiscountCode,
  readBagDiscount,
  readSavedDetails,
  regionsFor,
  rememberBagDiscount,
  rememberPrefill,
  saveDetails,
  type AppliedCode,
} from "./checkout-storage";
import { ItemThumb, Money, PageTitle, Panel, PrimaryButton, QuantityStepper, SecondaryButton, ShopperShell } from "./ShopperShell";
import { resolveShopperTheme } from "./theme";
import type { ShopperCommerce, ShopperStore } from "./types";
import type { ShopperProduct } from "./catalog";

type RecoverState = { status: "idle" } | { status: "loading" } | { status: "done"; unavailable: string[]; recovered: boolean } | { status: "error"; message: string };

export function CartPage({ store, basePath, commerce, preview = false }: { store: ShopperStore; basePath: string; commerce: ShopperCommerce; preview?: boolean }) {
  const theme = useMemo(() => resolveShopperTheme(store.brandSettings), [store.brandSettings]);
  const info = useMemo(() => readShopperInfo(store.shopper), [store.shopper]);
  const cart = useCart(store.slug);
  const wishlist = useWishlist(store.slug);
  const wishlistOn = commerce.cart.wishlist;
  const searchParams = useSearchParams();
  const recoverToken = searchParams.get("recover");
  const [recover, setRecover] = useState<RecoverState>({ status: "idle" });
  const [notice, setNotice] = useState("");
  // The owner's preview doesn't count as a shopper visit.
  useStoreVisitBeacon(preview ? "" : store.slug);

  const products = store.storeProducts;
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const checkoutHref = getPublicStorefrontPath(basePath, "/checkout");
  const productHref = (id: string) => getPublicStorefrontPath(basePath, `/product/${id}`);

  // A reminder link (?recover=<token>) puts the saved bag back, then drops the token from the address bar.
  const recoverStarted = useRef(false);
  useEffect(() => {
    if (!recoverToken || !cart.loaded || recoverStarted.current) return;
    recoverStarted.current = true;
    setRecover({ status: "loading" });
    fetch(`/api/public/store/${encodeURIComponent(store.slug)}/cart?recover=${encodeURIComponent(recoverToken)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "We couldn't find that bag. It may have expired.");
        const data = json.data as { token: string; items: CartLine[]; unavailable: string[]; contact: { name: string; email: string; phone: string }; discountCode: string | null; recovered: boolean };
        const have = new Set(cart.items.map(lineKey));
        cart.replace([...cart.items, ...data.items.filter((line) => !have.has(lineKey(line)))]);
        rememberCartToken(store.slug, data.recovered ? null : data.token);
        rememberStoreVisitor(store.slug, { email: data.contact.email || undefined, name: data.contact.name || undefined });
        rememberPrefill(store.slug, data.contact);
        if (data.discountCode) rememberBagDiscount(store.slug, data.discountCode);
        setRecover({ status: "done", unavailable: data.unavailable, recovered: data.recovered });
      })
      .catch((error: Error) => setRecover({ status: "error", message: error.message }))
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("recover");
        window.history.replaceState(null, "", url.pathname + url.search);
      });
  }, [recoverToken, cart, store.slug]);

  // ─── Discount code ──────────────────────────────────────────────────────────
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<AppliedCode | null>(null);
  const [codeError, setCodeError] = useState("");
  const [checking, setChecking] = useState(false);
  const codeId = useId();
  const couponsOn = commerce.checkout.enableCoupon;

  async function applyCode(code: string, quiet = false) {
    if (!code.trim()) return;
    setChecking(true);
    setCodeError("");
    const result = await checkDiscountCode(store.id, code, cart.subtotal);
    setChecking(false);
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

  const savedCode = useRef(false);
  useEffect(() => {
    if (!couponsOn || !cart.loaded || savedCode.current || cart.items.length === 0) return;
    const code = readBagDiscount(store.slug);
    if (!code) return;
    savedCode.current = true;
    void applyCode(code, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.loaded, cart.items.length, couponsOn, recover.status]);

  // ─── Delivery estimate ──────────────────────────────────────────────────────
  const regions = useMemo(() => regionsFor(store.country), [store.country]);
  const [place, setPlace] = useState({ state: "", city: "" });
  useEffect(() => {
    const saved = readSavedDetails(store.slug);
    setPlace({ state: saved.state ?? "", city: saved.city ?? "" });
  }, [store.slug]);
  const hasZones = commerce.zones.length > 0;
  // Delivery partners at checkout: their fees depend on the address, the parcel and who covers it, so the bag
  // doesn't guess (the store's zones would show the wrong price); checkout quotes them for the address.
  const partners = commerce.deliveryMode === "partners";
  const placeKnown = Boolean(place.state || place.city);
  const choice = deliveryOptionsFor(commerce.zones, commerce.flatRate, place, cart.subtotal, commerce.handlingDays);
  const delivery = partners ? null : !hasZones || placeKnown ? chooseDelivery(choice) : null;
  const summarised = useMemo(() => summariseDeliveryZones(commerce.zones.map((zone) => ({ name: zone.name ?? "", regions: zone.regions, rates: zone.rates }))), [commerce.zones]);
  const zoneHere = placeKnown ? matchZone(summarised, place.city, place.state) : null;
  const freeOver = partners ? null : zoneHere ? (zoneHere.alwaysFree ? null : zoneHere.freeOver) : freeDeliveryEverywhereOver(info.delivery);
  // Free delivery and the seller's reward tiers on one bar (Marketing > Rewards).
  const game = useMemo(() => readGameConfig((store.brandSettings as Record<string, unknown> | null | undefined)?.gamification ?? {}), [store.brandSettings]);
  const rewardTiers = game.progress.enabled ? game.progress.tiers : [];
  const deliveryOver = !game.progress.enabled || game.progress.freeDelivery ? freeOver : null;
  const giftNames = useMemo(() => Object.fromEntries(products.map((product) => [product.id, product.name])), [products]);

  const code = couponsOn ? applied : null;
  const fee = delivery?.fee ?? 0;
  // An estimate: the checkout quotes the exact total (automatic discounts and product-only codes included).
  const totals = orderTotals({ subtotal: cart.subtotal, shippingFee: fee, discount: code ? { type: code.type, amount: discountAmount(code, cart.items, fee) } : null });

  // ─── Suggestions and saved items ────────────────────────────────────────────
  const bagIds = cart.items.map((line) => line.productId);
  const suggestions = useMemo(
    () => suggestProducts(products, bagIds, commerce.checkout.enableUpsells ? commerce.checkout.upsellProducts : [], 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, bagIds.join(","), commerce.checkout.enableUpsells, commerce.checkout.upsellProducts],
  );
  const saved = wishlistOn ? wishlist.productIds.map((id) => productsById.get(id)).filter((product): product is ShopperProduct => Boolean(product)) : [];

  function addProduct(product: ShopperProduct) {
    // Sizes or colours to choose first: open the product page.
    if (needsOptions(product)) {
      window.location.assign(productHref(product.id));
      return;
    }
    cart.add({ productId: product.id, name: product.name, price: product.retailPrice, image: product.images[0] });
    setNotice(`${product.name} added to your bag.`);
  }

  // Preview: fill the bag with a few of the store's own products so the owner can try the whole flow.
  function fillWithSamples() {
    const simple = products.filter((product) => readVariants(product.variants).length === 0);
    const picks = (simple.length ? simple : products).slice(0, 3);
    for (const product of picks) cart.add({ productId: product.id, name: product.name, price: product.retailPrice, image: product.images[0] });
    setNotice(`${picks.length} sample ${picks.length === 1 ? "item" : "items"} added to your bag.`);
  }

  function moveToBag(product: ShopperProduct) {
    addProduct(product);
    void wishlist.remove(product.id);
  }

  function saveForLater(line: CartLine) {
    void wishlist.add(line.productId);
    cart.remove(line.productId, line.variant);
    setNotice(`${line.name} moved to your wishlist.`);
  }

  const lines = cart.items;

  return (
    <ShopperShell theme={theme} storeName={store.name} logoUrl={store.logoUrl} brandSettings={store.brandSettings} basePath={basePath} title="Bag" bagCount={cart.count} wishlistCount={wishlistOn ? wishlist.productIds.length : undefined} showWishlist={wishlistOn}>
      <p className="sr-only" role="status" aria-live="polite">{notice}</p>
      <PageTitle theme={theme} sub={cart.loaded && lines.length ? `${cart.count} ${cart.count === 1 ? "item" : "items"}` : undefined}>Your bag</PageTitle>

      {recover.status === "loading" ? <Banner theme={theme} tone="info">Putting your bag back together…</Banner> : null}
      {recover.status === "done" ? (
        <Banner theme={theme} tone="success">
          {recover.recovered ? "You already ordered these items. They're back in your bag in case you want them again." : "Welcome back. Your bag is just as you left it."}
          {recover.unavailable.length ? ` ${recover.unavailable.join(", ")} ${recover.unavailable.length === 1 ? "is" : "are"} no longer available.` : ""}
        </Banner>
      ) : null}
      {recover.status === "error" ? <Banner theme={theme} tone="error">{recover.message}</Banner> : null}

      {!cart.loaded ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading your bag">
          {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-[18px]" style={{ background: theme.border }} />)}
        </div>
      ) : lines.length === 0 ? (
        <EmptyBag theme={theme} basePath={basePath} saved={saved} currency={store.currency} onMove={moveToBag} productHref={productHref} preview={preview ? { hasProducts: products.length > 0, onFill: fillWithSamples } : null} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] xl:gap-10">
          <div className="grid min-w-0 gap-6">
            <Panel theme={theme} aria-label="Items in your bag">
              <ul className="m-0 list-none divide-y p-0" style={{ borderColor: theme.border }}>
                {lines.map((line) => {
                  const product = productsById.get(line.productId);
                  const lineTotal = line.price * line.quantity;
                  return (
                    <li key={lineKey(line)} className="flex gap-4 p-4 sm:p-5" style={{ borderColor: theme.border }}>
                      <Link href={productHref(line.productId)} className="shrink-0 focus-visible:outline focus-visible:outline-2" tabIndex={-1} aria-hidden>
                        <ItemThumb theme={theme} src={line.image ?? product?.images[0]} alt="" size={88} />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link href={productHref(line.productId)} className="line-clamp-2 text-[15px] font-semibold hover:underline focus-visible:outline focus-visible:outline-2">
                              {product?.name ?? line.name}
                            </Link>
                            {line.variant ? <p className="mt-0.5 text-[13px]" style={{ color: theme.muted }}>{line.variant}</p> : null}
                            <p className="mt-0.5 text-[13px]" style={{ color: theme.muted }}>{formatStoreMoney(line.price, store.currency)} each</p>
                          </div>
                          <p className="shrink-0 text-[15px] font-semibold tabular-nums"><Money amount={lineTotal} currency={store.currency} /></p>
                        </div>
                        {typeof line.maxQuantity === "number" && line.maxQuantity <= 5 ? (
                          <p className="text-[12.5px] font-medium" style={{ color: theme.accent }}>Only {line.maxQuantity} left</p>
                        ) : null}
                        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                          <QuantityStepper theme={theme} value={line.quantity} max={line.maxQuantity} label={line.name} onChange={(quantity) => cart.update(line.productId, quantity, line.variant)} />
                          {wishlistOn ? (
                            <button type="button" onClick={() => saveForLater(line)} className="inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" style={{ color: theme.muted }}>
                              <Icon name="heart" size={14} /> Save for later
                            </button>
                          ) : null}
                          <button type="button" onClick={() => cart.remove(line.productId, line.variant)} className="inline-flex min-h-10 items-center gap-1.5 text-[13.5px] font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" style={{ color: theme.muted }} aria-label={`Remove ${line.name} from your bag`}>
                            <Icon name="trash" size={14} /> Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            {saved.length ? (
              <section aria-labelledby="saved-heading">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id="saved-heading" className="text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>Saved for later</h2>
                  <Link href={getPublicStorefrontPath(basePath, "/wishlist")} className="text-[14px] font-medium underline underline-offset-4">See wishlist</Link>
                </div>
                <ProductRow theme={theme} products={saved.slice(0, 4)} currency={store.currency} productHref={productHref} actionLabel="Move to bag" onAction={moveToBag} />
              </section>
            ) : null}

            {suggestions.length ? (
              <section aria-labelledby="also-like-heading">
                <h2 id="also-like-heading" className="mb-3 text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>You may also like</h2>
                <ProductRow theme={theme} products={suggestions} currency={store.currency} productHref={productHref} actionLabel="Add" onAction={addProduct} />
              </section>
            ) : null}
          </div>

          <aside className="grid gap-4 lg:sticky lg:top-24" aria-label="Order summary">
            <Panel theme={theme} className="grid gap-5 p-5">
              <RewardProgress
                subtotal={cart.subtotal}
                freeDeliveryOver={deliveryOver}
                tiers={rewardTiers}
                giftNames={giftNames}
                currency={store.currency}
                colors={{ ink: theme.ink, muted: theme.muted, border: theme.border, cta: theme.cta, card: theme.surface }}
                giftInBag={(id) => lines.some((line) => line.productId === id)}
                onAddGift={(id) => { const gift = productsById.get(id); if (gift) addProduct(gift); }}
              />

              {couponsOn ? <WonCodeBanner storeSlug={store.slug} appliedCode={applied?.code} onApply={(value) => void applyCode(value)} colors={{ ink: theme.ink, border: theme.border, card: theme.paper, muted: theme.muted }} currency={store.currency} /> : null}

              {couponsOn ? (
                <div>
                  {applied ? (
                    <div className="flex items-center gap-2 rounded-[14px] px-3 py-2.5 text-[14px]" style={{ background: theme.paper }}>
                      <Icon name="tag" size={15} />
                      <span className="min-w-0 flex-1"><strong>{applied.code}</strong> applied</span>
                      <button type="button" onClick={() => { setApplied(null); rememberBagDiscount(store.slug, null); }} className="min-h-10 px-2 text-[13px] font-medium underline underline-offset-4">Remove</button>
                    </div>
                  ) : (
                    <form onSubmit={(event) => { event.preventDefault(); void applyCode(codeInput); }}>
                      <label htmlFor={codeId} className="text-[13.5px] font-medium">Discount code</label>
                      <div className="mt-1.5 flex gap-2">
                        <input id={codeId} value={codeInput} onChange={(event) => setCodeInput(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" className="h-11 min-w-0 flex-1 rounded-full border bg-white px-4 text-[15px] uppercase outline-none focus-visible:outline focus-visible:outline-2" style={{ borderColor: theme.border }} aria-invalid={codeError ? true : undefined} aria-describedby={codeError ? `${codeId}-error` : undefined} />
                        <SecondaryButton theme={theme} type="submit" disabled={checking || !codeInput.trim()}>{checking ? "Checking…" : "Apply"}</SecondaryButton>
                      </div>
                      {codeError ? <p id={`${codeId}-error`} role="alert" className="mt-1.5 text-[13px]" style={{ color: "#B42318" }}>{codeError}</p> : null}
                    </form>
                  )}
                </div>
              ) : null}

              {partners ? (
                <p className="flex items-center gap-2 text-[14px]"><Icon name="truck" size={15} /> Delivery calculated at checkout</p>
              ) : <DeliveryEstimate
                theme={theme}
                regions={regions}
                place={place}
                hasZones={hasZones}
                onChange={(next) => {
                  setPlace(next);
                  saveDetails(store.slug, next);
                }}
                covered={choice.covered}
                option={delivery?.option ?? null}
                currency={store.currency}
              />}

              <dl className="grid gap-2 border-t pt-4 text-[14.5px]" style={{ borderColor: theme.border }}>
                <Row label="Subtotal" value={<Money amount={totals.subtotal} currency={store.currency} />} />
                {totals.discountAmount > 0 ? <Row label={`Discount${applied ? ` (${applied.code})` : ""}`} value={<>−<Money amount={totals.discountAmount} currency={store.currency} /></>} /> : null}
                <Row
                  label="Delivery"
                  value={delivery ? (totals.shippingFee - totals.deliveryDiscount === 0 ? "Free" : <Money amount={totals.shippingFee - totals.deliveryDiscount} currency={store.currency} />) : <span style={{ color: theme.muted }}>At checkout</span>}
                />
                <div className="mt-1 flex items-baseline justify-between border-t pt-3 text-[17px] font-semibold" style={{ borderColor: theme.border }}>
                  <dt>{delivery ? "Total" : "Total before delivery"}</dt>
                  <dd className="m-0 tabular-nums"><Money amount={totals.total} currency={store.currency} /></dd>
                </div>
              </dl>

              <Link href={checkoutHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[16px] font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: theme.cta, color: theme.ctaText }}>
                <Icon name="lock" size={16} /> Checkout
              </Link>
              {commerce.checkout.enableTrustBadges ? <TrustLine theme={theme} labels={info.paymentLabels} payOnDelivery={info.payOnDelivery} /> : null}
              <Link href={getPublicStorefrontPath(basePath, "/")} className="text-center text-[14px] font-medium underline underline-offset-4">Continue shopping</Link>
            </Panel>
          </aside>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 lg:hidden" style={{ background: theme.surface, borderColor: theme.border, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px]" style={{ color: theme.muted }}>{delivery ? "Total" : "Before delivery"}</p>
                <p className="text-[17px] font-semibold tabular-nums"><Money amount={totals.total} currency={store.currency} /></p>
              </div>
              <Link href={checkoutHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-[16px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: theme.cta, color: theme.ctaText }}>
                Checkout
              </Link>
            </div>
          </div>
        </div>
      )}
    </ShopperShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className="m-0 tabular-nums">{value}</dd>
    </div>
  );
}

export function Banner({ theme, tone, children }: { theme: ReturnType<typeof resolveShopperTheme>; tone: "info" | "success" | "error"; children: React.ReactNode }) {
  const colours = tone === "error" ? { bg: "#FDECEA", fg: "#8A1C12" } : tone === "success" ? { bg: "#E7F5EC", fg: "#14532D" } : { bg: theme.surface, fg: theme.ink };
  return (
    <div role={tone === "error" ? "alert" : "status"} className="mb-5 flex items-start gap-2.5 rounded-[16px] border px-4 py-3 text-[14.5px] leading-6" style={{ background: colours.bg, color: colours.fg, borderColor: theme.border }}>
      <Icon name={tone === "error" ? "warn" : tone === "success" ? "checkCircle" : "info"} size={17} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function TrustLine({ theme, labels, payOnDelivery }: { theme: ReturnType<typeof resolveShopperTheme>; labels: string[]; payOnDelivery: boolean }) {
  const ways = labels.filter((label) => label !== "Pay on delivery");
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px]" style={{ color: theme.muted }}>
      <li className="flex items-center gap-2"><Icon name="shield" size={14} /> Secure checkout{ways.length ? `: ${ways.join(", ")}` : ""}</li>
      {payOnDelivery ? <li className="flex items-center gap-2"><Icon name="truck" size={14} /> Pay on delivery available</li> : null}
    </ul>
  );
}

function DeliveryEstimate({
  theme,
  regions,
  place,
  hasZones,
  onChange,
  covered,
  option,
  currency,
}: {
  theme: ReturnType<typeof resolveShopperTheme>;
  regions: string[];
  place: { state: string; city: string };
  hasZones: boolean;
  onChange: (place: { state: string; city: string }) => void;
  covered: boolean;
  option: { name: string; price: number; estimatedDays: string | null; pickup: boolean } | null;
  currency: string;
}) {
  const stateId = useId();
  const cityId = useId();
  if (!hasZones) {
    return option ? (
      <p className="flex items-center gap-2 text-[14px]"><Icon name="truck" size={15} /> Delivery {option.price > 0 ? formatStoreMoney(option.price, currency) : "is free"}</p>
    ) : null;
  }
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className="mb-1 flex items-center gap-2 p-0 text-[13.5px] font-medium"><Icon name="truck" size={15} /> Estimate delivery</legend>
      <div className="grid grid-cols-2 gap-2">
        {regions.length ? (
          <div>
            <label htmlFor={stateId} className="sr-only">State</label>
            <select id={stateId} value={place.state} onChange={(event) => onChange({ ...place, state: event.target.value })} className="h-11 w-full rounded-full border bg-white px-3 text-[14.5px]" style={{ borderColor: theme.border }}>
              <option value="">State</option>
              {regions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
          </div>
        ) : null}
        <div className={regions.length ? "" : "col-span-2"}>
          <label htmlFor={cityId} className="sr-only">Area or city</label>
          <input id={cityId} value={place.city} onChange={(event) => onChange({ ...place, city: event.target.value })} placeholder="Area or city" className="h-11 w-full rounded-full border bg-white px-4 text-[14.5px]" style={{ borderColor: theme.border }} />
        </div>
      </div>
      {place.state || place.city ? (
        <p className="text-[13.5px]" style={{ color: theme.muted }} aria-live="polite">
          {!covered
            ? "The store hasn't set a delivery fee for this area yet. They'll confirm delivery with you after you order."
            : option
              ? `${option.pickup ? "Pickup" : option.name}: ${option.price > 0 ? formatStoreMoney(option.price, currency) : "free"}${option.estimatedDays ? ` · ${option.estimatedDays}` : ""}`
              : "Delivery to this area is free."}
        </p>
      ) : null}
    </fieldset>
  );
}

function EmptyBag({
  theme,
  basePath,
  saved,
  currency,
  onMove,
  productHref,
  preview,
}: {
  theme: ReturnType<typeof resolveShopperTheme>;
  basePath: string;
  saved: ShopperProduct[];
  currency: string;
  onMove: (product: ShopperProduct) => void;
  productHref: (id: string) => string;
  preview: { hasProducts: boolean; onFill: () => void } | null;
}) {
  return (
    <div className="grid gap-8">
      <Panel theme={theme} className="grid justify-items-center gap-3 px-6 py-14 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: theme.paper }}><Icon name="bag" size={24} /></span>
        <h2 className="text-[20px] font-semibold" style={{ fontFamily: theme.heading }}>Your bag is empty</h2>
        <p className="max-w-[40ch] text-[15px]" style={{ color: theme.muted }}>Find something you love and it will wait for you here.</p>
        <Link href={getPublicStorefrontPath(basePath, "/")} className="mt-2 inline-flex min-h-12 items-center rounded-full px-7 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: theme.cta, color: theme.ctaText }}>
          Start shopping
        </Link>
        {preview ? (
          preview.hasProducts ? (
            <SecondaryButton theme={theme} type="button" onClick={preview.onFill}>
              <Icon name="sparkle" size={15} /> Try it with sample items
            </SecondaryButton>
          ) : (
            <p className="max-w-[44ch] text-[13.5px]" style={{ color: theme.muted }}>
              Preview tip: add a product in <a href="/products" className="font-semibold underline underline-offset-4" style={{ color: theme.ink }}>Products</a> to try the bag and checkout with real items.
            </p>
          )
        ) : null}
      </Panel>
      {saved.length ? (
        <section aria-labelledby="empty-saved-heading">
          <h2 id="empty-saved-heading" className="mb-3 text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>From your wishlist</h2>
          <ProductRow theme={theme} products={saved.slice(0, 8)} currency={currency} productHref={productHref} actionLabel="Move to bag" onAction={onMove} />
        </section>
      ) : null}
    </div>
  );
}

/** A row of product cards; products with options link to their page to choose. */
export function ProductRow({
  theme,
  products,
  currency,
  productHref,
  actionLabel,
  onAction,
  secondary,
}: {
  theme: ReturnType<typeof resolveShopperTheme>;
  products: ShopperProduct[];
  currency: string;
  productHref: (id: string) => string;
  actionLabel: string;
  onAction: (product: ShopperProduct) => void;
  secondary?: { label: (product: ShopperProduct) => string; onClick: (product: ShopperProduct) => void };
}) {
  return (
    <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
      {products.map((product) => {
        const needsOptions = readVariants(product.variants).length > 0;
        return (
          <li key={product.id} className="flex min-w-0 flex-col overflow-hidden border" style={{ background: theme.surface, borderColor: theme.border, borderRadius: theme.radius }}>
            <Link href={productHref(product.id)} className="block aspect-square overflow-hidden focus-visible:outline focus-visible:outline-2" style={{ background: theme.border }}>
              {product.images[0] ? <img src={product.images[0]} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
            </Link>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <Link href={productHref(product.id)} className="line-clamp-2 text-[14px] font-medium hover:underline">{product.name}</Link>
              <p className="text-[14px] font-semibold tabular-nums">{formatStoreMoney(product.retailPrice, product.currency || currency)}</p>
              <div className="mt-auto grid gap-1.5">
                {needsOptions ? (
                  <Link href={productHref(product.id)} className="inline-flex min-h-10 items-center justify-center rounded-full border px-3 text-[13px] font-semibold focus-visible:outline focus-visible:outline-2" style={{ borderColor: theme.border }}>
                    Choose options
                  </Link>
                ) : (
                  <PrimaryButton theme={theme} type="button" onClick={() => onAction(product)} className="!min-h-10 !px-3 !text-[13px]" aria-label={`${actionLabel}: ${product.name}`}>
                    {actionLabel}
                  </PrimaryButton>
                )}
                {secondary ? (
                  <button type="button" onClick={() => secondary.onClick(product)} className="min-h-9 text-[13px] font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2" style={{ color: theme.muted }}>
                    {secondary.label(product)}
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
