"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { addSupplierProductToStore, messageSupplier, requestSupplierQuote, toggleSavedProduct } from "@/app/actions/sourcing";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { clampSellingPrice, naira, priceStep, saleBreakdown, supplierInitials, tierPrice, type FindProduct } from "@/lib/marketplace/find";
import { listingProblem } from "@shared/dropship-checkout";
import { DropshipTermsPanel, START_CHOICE, type ListingChoiceState } from "./DropshipTermsPanel";
import { SampleNotice } from "./SampleNotice";
import { messagesHref } from "@/lib/conversations/pure";
import { sellerWholesaleStage } from "@/lib/supplier-orders/pure";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { BeforeYouList, type ListingInfo } from "./BeforeYouList";
import { SupplierTrustBadges } from "./SupplierTrust";
import { formatDate, formatMoney, formatNumber } from "@shared/i18n";
import { localWholesaleStage } from "./wholesaleStage";
import { Term } from "@/components/learn/Term";
import { depositSplit, toKobo } from "@shared/preorder";

const CARD = "rounded-[20px] border border-app-line bg-white";

export interface MyWholesaleOrder {
  id: string;
  quantity: number;
  totalPrice: number;
  status: string;
  trackingCode: string | null;
  rejectReason: string | null;
  createdAt: string;
}

/** Product page in Find products: price it, see the money on each sale, add it, or buy wholesale. */
export function ProductDetail({ product, added: addedAtStart, saved: savedAtStart, notified, defaultAddress = "", wholesaleOrders = [], listing, tip, startWholesale = false }: { product: FindProduct; added: boolean; saved: boolean; notified: boolean; defaultAddress?: string; wholesaleOrders?: MyWholesaleOrder[]; /** Opened from Wholesale orders ("Buy wholesale"): start on the bulk order, not dropship. */ startWholesale?: boolean; listing?: ListingInfo; /** Peggy's tip under the title (rendered by the page, hidden when tips are off). */ tip?: ReactNode }) {
  const router = useRouter();
  const t = useT("marketplace");
  const locale = useLocale();
  const money = (amount: number) => (locale === "en" ? naira(amount) : formatMoney(Math.round(amount), locale));
  const num = (value: number) => (locale === "en" ? value.toLocaleString("en-NG") : formatNumber(value, locale));
  const [mode, setMode] = useState<"dropship" | "wholesale">(product.dropship && !(startWholesale && product.wholesale) && !(product.preorder?.on && product.wholesale) ? "dropship" : "wholesale");
  // Dropship terms (live products): never below the supplier's lowest allowed price (src/lib/marketplace/dropship-listing.server.ts).
  const terms = product.dropship ? product.terms ?? null : null;
  const lowest = Math.ceil((terms?.floor ?? product.floor ?? 0) / 100) * 100;
  const clampPrice = (value: number) => Math.max(lowest, clampSellingPrice(value, product.cost));
  const [price, setPrice] = useState(() => clampPrice(product.price));
  const [choice, setChoice] = useState<ListingChoiceState>(() => ({ ...START_CHOICE }));
  const [quantity, setQuantity] = useState(product.moq);
  const [image, setImage] = useState(0);
  const [added, setAdded] = useState(addedAtStart);
  const [saved, setSaved] = useState(savedAtStart);
  const [quoted, setQuoted] = useState(false);
  const [address, setAddress] = useState(defaultAddress);
  const [orderNote, setOrderNote] = useState("");
  const [placed, setPlaced] = useState<MyWholesaleOrder[]>(wholesaleOrders);
  const [justPlaced, setJustPlaced] = useState(false);
  // A preorder placed here: the button turns into "Preorder placed" (no second order by a second tap).
  const [preorderPlaced, setPreorderPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [pending, start] = useTransition();

  const preorder = product.preorder?.on ? product.preorder : null;
  const sale = saleBreakdown(price, product.cost);
  const step = priceStep(price);
  const wholesaleBase = product.wholesaleCost ?? product.cost;
  const unit = tierPrice(product.tiers, quantity, wholesaleBase);
  const flatFee = choice.flatFee === "" ? null : Number(choice.flatFee);
  const priceProblem = terms ? listingProblem(terms, { retailPrice: price, payer: choice.payer, flatFee }) : null;
  const supplier = product.supplier;
  const [sample, setSample] = useState(product.sampleOffer ?? null);
  const meta = [
    supplier.name,
    supplier.city,
    supplier.rating ? `★ ${supplier.rating.toFixed(1)}${supplier.ratingCount ? ` (${num(supplier.ratingCount)})` : ""}` : "",
    (product.shopsSelling ?? 0) > 0 ? t("shops.selling", { count: product.shopsSelling ?? 0 }) : "",
    product.ships,
    supplier.onTimePct ? t("pd.onTime", { pct: supplier.onTimePct }) : "",
  ].filter(Boolean);

  function guard(action: () => void) {
    if (product.sample) {
      setSampleOpen(true);
      return;
    }
    setError(null);
    action();
  }

  const add = () =>
    guard(() =>
      start(async () => {
        const result = await addSupplierProductToStore({
          supplierProductId: product.id,
          retailPrice: price,
          ...(terms
            ? {
                deliveryPayer: choice.payer,
                deliveryFlatFee: choice.payer === "flat" && flatFee !== null && Number.isFinite(flatFee) ? flatFee : null,
                sku: choice.sku.trim() || undefined,
              }
            : {}),
        });
        if (result.ok) setAdded(true);
        else if (result.sample) setSampleOpen(true);
        else setError(result.error);
      }),
    );

  const save = () =>
    guard(() =>
      start(async () => {
        const result = await toggleSavedProduct(product.id);
        if (result.ok) setSaved(result.saved);
        else setError(result.error);
      }),
    );

  const quote = () =>
    guard(() =>
      start(async () => {
        const result = await requestSupplierQuote({ supplierProductId: product.id, quantity });
        if (result.ok) setQuoted(true);
        else setError(result.error);
      }),
    );

  // One sample at the dropship price (shared/samples.ts): a wholesale order of 1, paid once the supplier accepts.
  const orderSample = () =>
    guard(() =>
      start(async () => {
        if (address.trim().length < 5) {
          setError(t("pd.addressError"));
          return;
        }
        const response = await fetch("/api/app/wholesale/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplierProductId: product.id, quantity: 1, sample: true, deliveryAddress: address.trim() }),
        }).catch(() => null);
        const body = (await response?.json().catch(() => null)) as { data?: { id: string; status: string }; error?: { message?: string } } | null;
        if (!response?.ok || !body?.data) {
          setError(body?.error?.message ?? t("pd.placeError"));
          return;
        }
        setSample((now) => (now ? { ...now, ordered: { id: body.data!.id, status: body.data!.status } } : now));
      }),
    );

  const placeWholesale = () =>
    guard(() =>
      start(async () => {
        if (address.trim().length < 5) {
          setError(t("pd.addressError"));
          return;
        }
        // The seller app's own API (cookie session); the supplier sees it in their Orders.
        const response = await fetch("/api/app/wholesale/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplierProductId: product.id, quantity, deliveryAddress: address.trim(), notes: orderNote.trim() || undefined }),
        }).catch(() => null);
        const body = (await response?.json().catch(() => null)) as { data?: { id: string; quantity: number; totalPrice: number; status: string; createdAt: string; depositKobo?: number }; error?: { message?: string } } | null;
        if (!response?.ok || !body?.data) {
          setError(body?.error?.message ?? t("pd.placeError"));
          return;
        }
        const order = body.data;
        setPlaced((list) => [{ id: order.id, quantity: order.quantity, totalPrice: order.totalPrice, status: order.status, trackingCode: null, rejectReason: null, createdAt: order.createdAt }, ...list]);
        setJustPlaced(true);
        setOrderNote("");
        if (preorder) {
          setPreorderPlaced(true);
          // A deposit is paid now, by card, straight to the supplier's bank (shared/preorder.ts depositSplit):
          // Paystack comes back to /home/preorders, which confirms it. If it can't start, Pay deposit is there.
          if ((order.depositKobo ?? 0) > 0) {
            const started = await fetch(`/api/app/wholesale/${encodeURIComponent(order.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay" }) }).catch(() => null);
            const payBody = (await started?.json().catch(() => null)) as { data?: { authorizationUrl?: string | null }; error?: { message?: string } } | null;
            if (started?.ok && payBody?.data?.authorizationUrl) window.location.assign(payBody.data.authorizationUrl);
            else setError(payBody?.error?.message ?? t("pd.depositLater"));
          }
        }
      }),
    );

  return (
    <div className="grid min-w-0 gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/marketplace"))}
            aria-label={t("pd.back")}
            className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-app-line bg-white hover:border-app-line-strong"
          >
            <Icon name="arrowLeft" size={17} />
          </button>
          <div className="min-w-0">
            <h1 className="m-0 break-words text-[26px] font-extrabold leading-[1.1] tracking-[-0.6px] sm:text-[30px]">{product.name}</h1>
            <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">
              {meta.map((part, index) => (
                <span key={part}>
                  {index > 0 && <span aria-hidden> · </span>}
                  {part.startsWith("★") ? <><span className="text-[#F2A93B]">★</span>{part.slice(1)}</> : part}
                </span>
              ))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={pending} aria-pressed={saved} className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold hover:border-app-line-strong disabled:opacity-60">
            <Icon name="heart" size={15} fill={saved ? "currentColor" : "none"} className={saved ? "text-app-accent" : ""} /> {saved ? t("pd.saved") : t("pd.save")}
          </button>
          <button type="button" onClick={() => guard(() => setMessageOpen(true))} className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-bold hover:border-app-line-strong">
            <Icon name="chat" size={15} /> {t("pd.message")}
          </button>
        </div>
      </header>

      {tip}

      {product.sample && (
        <p className="m-0 flex flex-wrap items-center gap-2 rounded-[14px] border border-dashed border-app-line-strong bg-white px-3.5 py-2.5 text-[13.5px] text-app-ink-soft">
          <span className="rounded-full bg-[#FDF0D5] px-2.5 py-0.5 text-[12px] font-extrabold text-[#8A5A00]">{t("pd.sampleBadge")}</span>
          {t("pd.sampleNote")}
        </p>
      )}
      {error && <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">{error}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <div className="grid min-w-0 gap-4 lg:col-start-1 lg:row-start-1">
          <div className="overflow-hidden rounded-[20px] bg-app-canvas">
            {product.images[image] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.images[image]} alt={product.name} className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="grid aspect-[4/3] place-items-center text-app-ink-faint"><Icon name="image" size={40} /></div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {product.images.slice(0, 4).map((src, index) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setImage(index)}
                  aria-label={t("pd.photo", { n: index + 1 })}
                  aria-pressed={image === index}
                  className={cx("overflow-hidden rounded-[14px] border-2 bg-app-canvas p-0", image === index ? "border-app-ink" : "border-transparent hover:border-app-line-strong")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
                </button>
              ))}
            </div>
          )}

        </div>

        <div className="grid min-w-0 gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div role="tablist" aria-label={t("pd.howSell")} className="grid grid-cols-2 gap-1 rounded-full bg-white p-1">
            {([["dropship", t("pd.mode.dropship")], ["wholesale", t("pd.mode.wholesale")]] as const).map(([value, label]) => {
              const disabled = value === "dropship" ? !product.dropship : !product.wholesale;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  disabled={disabled}
                  onClick={() => setMode(value)}
                  className={cx("min-h-[40px] rounded-full px-3 text-[13.5px] font-bold disabled:cursor-not-allowed disabled:opacity-40", mode === value ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas")}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="m-0 px-2 text-[13px] leading-[1.5] text-app-ink-soft">
            <strong className="font-extrabold text-app-ink">
              <Term k={mode === "dropship" ? "dropship" : "wholesale"}>{mode === "dropship" ? t("pd.mode.dropship") : t("pd.mode.wholesale")}</Term>:
            </strong>{" "}
            {mode === "dropship" ? t("pd.modeHelp.dropship") : t("pd.modeHelp.wholesale")}
          </p>

          {mode === "dropship" ? (
            <>
              {terms ? null : (
              <section className={cx(CARD, "p-4 text-center")}>
                <h2 className="m-0 text-[13px] font-bold text-app-ink-soft">{t("pd.sellingPrice")}</h2>
                <div className="mx-auto mt-2 inline-flex items-center gap-3 rounded-full bg-app-canvas p-1">
                  <button type="button" aria-label={t("pd.lower", { amount: money(step) })} onClick={() => setPrice((value) => clampPrice(value - priceStep(value - 1)))} className="grid h-10 w-10 place-items-center rounded-full bg-white text-[18px] font-extrabold">
                    <Icon name="minus" size={16} />
                  </button>
                  <output aria-live="polite" className="min-w-[120px] text-[24px] font-extrabold tracking-[-0.5px]">{money(price)}</output>
                  <button type="button" aria-label={t("pd.raise", { amount: money(step) })} onClick={() => setPrice((value) => clampPrice(value + priceStep(value)))} className="grid h-10 w-10 place-items-center rounded-full bg-app-ink text-white">
                    <Icon name="plus" size={16} />
                  </button>
                </div>
                {product.similar && (
                  <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">{t("pd.similar", { low: money(product.similar[0]), high: money(product.similar[1]) })}</p>
                )}
              </section>
              )}

              {terms ? (
                <>
                <DropshipTermsPanel
                  terms={terms}
                  price={price}
                  paymentFee={sale.fee}
                  supplierName={supplier.name}
                  choice={choice}
                  onChange={setChoice}
                  money={money}
                  problem={priceProblem}
                  disabled={added}
                  priceControl={
                    <span className="mt-0.5 flex items-center gap-0.5 normal-case tracking-normal">
                      <button type="button" disabled={added} aria-label={t("pd.lower", { amount: money(step) })} onClick={() => setPrice((value) => clampPrice(value - priceStep(value - 1)))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-canvas text-app-ink hover:bg-app-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent disabled:opacity-40">
                        <Icon name="minus" size={13} strokeWidth={2.6} />
                      </button>
                      <output aria-live="polite" aria-label={t("pd.sellingPrice")} className="min-w-0 flex-1 truncate text-center font-app-display text-[16px] font-extrabold text-app-ink">{money(price)}</output>
                      <button type="button" disabled={added} aria-label={t("pd.raise", { amount: money(step) })} onClick={() => setPrice((value) => clampPrice(value + priceStep(value)))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-ink text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent disabled:opacity-40">
                        <Icon name="plus" size={13} strokeWidth={2.6} />
                      </button>
                    </span>
                  }
                />
                {product.similar && <p className="m-0 px-1 text-[12px] text-app-ink-soft">{t("pd.similar", { low: money(product.similar[0]), high: money(product.similar[1]) })}</p>}
                </>
              ) : (
              <section className={cx(CARD, "p-4")}>
                <h2 className="m-0 text-[14.5px] font-extrabold">{t("pd.eachSale")}</h2>
                <dl className="m-0 mt-2 grid gap-2 text-[14px]">
                  <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">{t("pd.shopperPays")}</dt><dd className="m-0 font-bold">{money(sale.shopperPays)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="min-w-0 truncate text-app-ink-soft">{t("pd.supplierGets", { name: supplier.name })}</dt><dd className="m-0 font-bold">−{money(sale.supplierGets)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">{t("pd.fee")}</dt><dd className="m-0 font-bold">−{money(sale.fee)}</dd></div>
                </dl>
                <div className="mt-3 border-t border-app-line pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14.5px] font-extrabold">{t("pd.keep")}</span>
                    <span className={cx("text-[17px] font-extrabold", sale.keep > 0 ? "text-app-success" : "text-app-danger")}>{money(sale.keep)} · {sale.keepPct}%</span>
                  </div>
                  <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">{t("pd.delivery")}</p>
                </div>
              </section>
              )}

              {sample ? (
                <section className={cx(CARD, "grid gap-2 p-4")} data-testid="sample-offer">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#FDF0D5] text-[#8A5A00]"><Icon name="package" size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="m-0 text-[14.5px] font-extrabold">{t("trySample.title")}</h2>
                      <p className="m-0 mt-0.5 text-[13px] leading-[1.45] text-app-ink-soft">{t("trySample.body", { price: money(sample.price) })}</p>
                    </div>
                  </div>
                  {sample.ordered ? (
                    <p role="status" className="m-0 flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-app-success-tint px-3 py-2 text-[13.5px] font-extrabold text-app-success">
                      <span className="inline-flex items-center gap-1.5"><Icon name="check" size={15} /> {t("trySample.ordered")}</span>
                      <Link href="/marketplace/wholesale" className="text-app-success underline-offset-2 hover:underline">{t("trySample.see")}</Link>
                    </p>
                  ) : (
                    <button type="button" data-testid="sample-order" onClick={orderSample} disabled={pending} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-app-ink bg-white px-5 text-[14px] font-bold text-app-ink hover:bg-app-canvas disabled:opacity-60">
                      {pending ? t("pd.sending") : t("trySample.order", { price: money(sample.price) })}
                    </button>
                  )}
                  {!sample.ordered ? <p className="m-0 text-[12px] leading-[1.45] text-app-ink-soft">{t("trySample.note", { address: address.trim() || "—" })}</p> : null}
                </section>
              ) : null}

              {!added && listing && listing.step !== "ready" ? (
                <BeforeYouList supplier={product.supplier} listing={listing} />
              ) : added ? (
                <div role="status" className="flex min-h-[54px] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full bg-app-success-tint px-5 text-[15px] font-extrabold text-app-success">
                  <span className="inline-flex items-center gap-2"><Icon name="check" size={17} /> {t("pd.addedToStore")}</span>
                  <Link href="/products" className="text-app-success underline-offset-2 hover:underline">{t("pd.viewProducts")}</Link>
                </div>
              ) : (
                <button type="button" onClick={add} disabled={pending || !!priceProblem} className="inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-app-accent px-5 text-[16px] font-extrabold text-app-ink hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink focus-visible:ring-offset-2 disabled:opacity-60">
                  {pending ? t("pd.adding") : t("pd.addAt", { price: ` ${money(price)}` }).replace("  ", " ")}
                </button>
              )}
            </>
          ) : (
            <>
              <section className={cx(CARD, "p-4")}>
                <h2 className="m-0 text-[14.5px] font-extrabold">{t("pd.buyWholesale")}</h2>
                <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">{t("pd.moq", { count: num(product.moq) })}</p>
                {preorder && (
                  // The supplier takes preorders: the stock isn't here yet and ships from their date (shared/preorder.ts).
                  <div className="mt-3 grid gap-1 rounded-[14px] bg-[#FDF0D5] px-3 py-2.5 text-[13px] leading-[1.5] text-[#5C3D00]">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
                      <span className="rounded-full bg-white/70 px-2 py-0.5 text-[12px]">{t("pd.preorder")}</span>
                      {preorder.shipsOn ? t("pd.preorderShips", { date: formatDate(new Date(`${preorder.shipsOn}T12:00:00Z`), locale, { day: "numeric", month: "short" }) }) : t("pd.preorderSoon")}
                      {preorder.left !== null && <span className="font-normal">{preorder.open ? t("pd.preorderLeft", { count: num(preorder.left) }) : t("pd.preorderFull")}</span>}
                    </span>
                    {preorder.note && <span>{preorder.note}</span>}
                    {(preorder.depositPct ?? 0) > 0 && (
                      <span className="font-bold">
                        {t("pd.preorderDeposit", { pct: String(preorder.depositPct), amount: money(depositSplit(toKobo(unit * quantity), preorder.depositPct ?? 0).depositKobo / 100) })}
                      </span>
                    )}
                    <span>{t("pd.preorderWhy")}</span>
                  </div>
                )}
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[14px]">
                  {(product.tiers.length ? product.tiers : [{ minQty: product.moq, price: wholesaleBase }]).map((tier) => (
                    <li key={tier.minQty} className={cx("flex justify-between gap-3 rounded-[12px] px-3 py-2", unit === tier.price && quantity >= tier.minQty ? "bg-app-canvas font-bold" : "")}>
                      <span>{t("pd.units", { range: `${num(tier.minQty)}${"maxQty" in tier && tier.maxQty ? `–${num(tier.maxQty)}` : "+"}` })}</span>
                      <span>{t("pd.each", { price: money(tier.price) })}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-app-line pt-3">
                  <label htmlFor="wholesale-qty" className="text-[14px] font-bold">{t("pd.howMany")}</label>
                  <input
                    id="wholesale-qty"
                    type="number"
                    inputMode="numeric"
                    min={product.moq}
                    step={1}
                    value={quantity}
                    onChange={(event) => setQuantity(Math.max(product.moq, Math.floor(Number(event.target.value) || product.moq)))}
                    className="h-11 w-[120px] rounded-[12px] border border-app-line px-3 text-right text-[15px] font-bold outline-none focus:border-app-ink"
                  />
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] text-app-ink-soft">{t("pd.each", { price: money(unit) })}</span>
                  <span className="text-[17px] font-extrabold">{money(unit * quantity)}</span>
                </div>
              </section>
              <section className={cx(CARD, "grid gap-3 p-4")}>
                <h2 className="m-0 text-[14.5px] font-extrabold">{t("pd.place")}</h2>
                <div>
                  <label htmlFor="wholesale-address" className="mb-1 block text-[13px] font-bold">{t("pd.deliverTo")}</label>
                  <textarea
                    id="wholesale-address"
                    rows={2}
                    maxLength={300}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder={t("pd.addressPh")}
                    className="w-full resize-y rounded-[12px] border border-app-line px-3 py-2 text-[14px] outline-none focus:border-app-ink"
                  />
                </div>
                <div>
                  <label htmlFor="wholesale-note" className="mb-1 block text-[13px] font-bold">{t("pd.noteFor", { name: supplier.name })} <span className="font-normal text-app-ink-soft">{t("pd.optional")}</span></label>
                  <input
                    id="wholesale-note"
                    maxLength={1000}
                    value={orderNote}
                    onChange={(event) => setOrderNote(event.target.value)}
                    placeholder={t("pd.notePh")}
                    className="h-11 w-full rounded-[12px] border border-app-line px-3 text-[14px] outline-none focus:border-app-ink"
                  />
                </div>
                <p className="m-0 rounded-[12px] bg-app-canvas px-3 py-2 text-[12.5px] leading-[1.5] text-app-ink-soft">
                  <strong className="text-app-ink">{t("pd.noPay")}</strong> {t("pd.noPayBody", { name: supplier.name })}
                </p>
                {justPlaced && (
                  <p role="status" className="m-0 rounded-[14px] bg-app-success-tint px-3 py-2 text-[13.5px] font-extrabold text-app-success">
                    {t("pd.sent", { name: supplier.name })}
                  </p>
                )}
                {preorder && preorderPlaced ? (
                  <div className="grid gap-2">
                    <button type="button" disabled className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-app-success-tint px-5 text-[15.5px] font-bold text-app-success">
                      <Icon name="check" size={16} /> {t("pd.preorderPlaced")}
                    </button>
                    <Link href="/home/preorders?view=suppliers" className="text-center text-[13.5px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("pd.seePreorders")}</Link>
                  </div>
                ) : (
                <button type="button" onClick={placeWholesale} disabled={pending || quantity < product.moq || (preorder !== null && !preorder.open)} className="inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-app-ink px-5 text-[15.5px] font-bold text-white hover:bg-black disabled:opacity-60">
                  {pending ? t("pd.sending") : preorder ? (preorder.open ? t("pd.preorderFor", { count: num(quantity), total: money(unit * quantity) }) : t("pd.preorderFull")) : t("pd.orderFor", { count: num(quantity), total: ` ${money(unit * quantity)}` }).replace("  ", " ")}
                </button>
                )}
                {quoted ? (
                  <p role="status" className="m-0 text-[13px] font-bold text-app-success">
                    {t("pd.quoted", { name: supplier.name, count: num(quantity) })}
                  </p>
                ) : (
                  <button type="button" onClick={quote} disabled={pending} className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-app-line bg-white px-5 text-[14px] font-bold hover:border-app-line-strong disabled:opacity-60">
                    {t("pd.betterPrice")}
                  </button>
                )}
              </section>
              {placed.length > 0 && (
                <section className={cx(CARD, "p-4")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="m-0 text-[14.5px] font-extrabold">{t("pd.yourOrders")}</h2>
                    <Link href="/marketplace/wholesale" className="text-[13px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("pd.allOrders")}</Link>
                  </div>
                  <ul className="m-0 mt-2 grid list-none gap-2 p-0 text-[13.5px]">
                    {placed.map((order) => (
                      <li key={order.id} className="grid gap-0.5">
                        <div className="flex justify-between gap-3">
                          <span>{t("pd.unitsTotal", { count: num(order.quantity), total: money(order.totalPrice) })}</span>
                          <span className="font-bold">{localWholesaleStage(t, sellerWholesaleStage(order.status, order.rejectReason)).label}</span>
                        </div>
                        {order.trackingCode && <span className="text-app-ink-soft">{t("pd.tracking", { code: order.trackingCode })}</span>}
                        {(() => {
                          const stage = localWholesaleStage(t, sellerWholesaleStage(order.status, order.rejectReason));
                          return stage.note ? <span className={stage.tone === "danger" ? "text-app-danger" : "text-app-ink-soft"}>{stage.note}</span> : null;
                        })()}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <section className={cx(CARD, "flex items-center gap-3 p-4")}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-app-peach text-[14px] font-extrabold text-app-accent-ink">{supplierInitials(supplier.name)}</span>
            <div className="min-w-0">
              <div className="truncate text-[14.5px] font-extrabold">
                {supplier.slug ? <Link href={`/suppliers/${supplier.slug}`} className="text-app-ink no-underline hover:underline">{supplier.name}</Link> : supplier.name}
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[13px] text-app-ink-soft">
                {product.sample ? (supplier.verified && <><Icon name="checkCircle" size={14} className="text-app-success" /> {t("pd.verified")}</>) : <SupplierTrustBadges supplier={supplier} compact />}
                {product.stock > 0 && <span>· {t("pd.inStock", { count: num(product.stock) })}</span>}
              </div>
            </div>
          </section>
          {!product.sample && (supplier.ratingCount ?? 0) > 0 ? (
            <section className={cx(CARD, "grid gap-2 p-4")} data-testid="supplier-ratings">
              <h2 className="m-0 flex flex-wrap items-baseline justify-between gap-2 text-[14.5px] font-extrabold">
                {t("rate.whatShopsSay")}
                <span className="text-[13px] font-bold text-app-ink-soft"><span className="text-[#F2A93B]">★</span> {supplier.rating?.toFixed(1)} · {t("rate.count", { count: supplier.ratingCount ?? 0 })}</span>
              </h2>
              {(product.ratings ?? []).filter((entry) => entry.text).map((entry) => (
                <p key={entry.at} className="m-0 text-[13.5px] leading-[1.5]">
                  <span className="mr-1.5 font-extrabold text-[#F2A93B]" aria-label={t("rate.stars", { count: entry.rating })}>{"★".repeat(entry.rating)}</span>
                  {entry.text}
                </p>
              ))}
            </section>
          ) : null}
          <section className={cx(CARD, "grid gap-1.5 p-4")}>
            <h2 className="m-0 text-[14.5px] font-extrabold">{t("pd.returns", { name: supplier.name })}</h2>
            <p className="m-0 whitespace-pre-line text-[13.5px] leading-[1.5]">{supplier.returnPolicy || t("pd.returnsDefault", { name: supplier.name })}</p>
            <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("pd.returnsNote")}</p>
          </section>
        </div>
        <div className="grid min-w-0 gap-4 lg:col-start-1">
          <section className={cx(CARD, "p-4 sm:p-5")}>
            <h2 className="m-0 text-[15px] font-extrabold">{t("pd.whatHappens")}</h2>
            <ol className="m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-2">
              {[
                t("pd.step.0"),
                t("pd.step.1", { name: supplier.name }),
                t("pd.step.2"),
                t("pd.step.3"),
              ].map((text, index) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-app-canvas text-[13px] font-extrabold">{index + 1}</span>
                  <span className="pt-0.5 text-[13.5px] leading-[1.45]">{text}</span>
                </li>
              ))}
            </ol>
          </section>

          {product.description && (
            <section className={cx(CARD, "p-4 sm:p-5")}>
              <h2 className="m-0 text-[15px] font-extrabold">{t("pd.about")}</h2>
              <p className="mb-0 mt-2 whitespace-pre-line text-[14px] leading-[1.6] text-app-ink-soft">{product.description}</p>
            </section>
          )}
        </div>
      </div>

      <SampleNotice open={sampleOpen} onClose={() => setSampleOpen(false)} productName={product.name} notified={notified} />
      <MessageDialog
        open={messageOpen}
        supplierName={supplier.name}
        productName={product.name}
        onClose={() => setMessageOpen(false)}
        onSend={async (text) => {
          const result = await messageSupplier({ supplierProductId: product.id, text });
          if (!result.ok) return result.error;
          router.push(messagesHref("seller", { conversation: result.conversationId }));
          return null;
        }}
      />
    </div>
  );
}

function MessageDialog({ open, supplierName, productName, onClose, onSend }: { open: boolean; supplierName: string; productName: string; onClose: () => void; onSend: (text: string) => Promise<string | null> }) {
  const t = useT("marketplace");
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="message-supplier-title" className="m-auto w-[calc(100%-32px)] max-w-[480px] rounded-[22px] border border-app-line bg-white p-0 text-app-ink backdrop:bg-black/40">
      <form
        className="p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          start(async () => {
            const problem = await onSend(text);
            if (problem) setError(problem);
          });
        }}
      >
        <h2 id="message-supplier-title" className="m-0 text-[19px] font-extrabold">{t("pd.msgTitle", { name: supplierName })}</h2>
        <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">{t("pd.msgAbout", { product: productName })}</p>
        <label htmlFor="message-supplier-text" className="sr-only">{t("pd.yourMessage")}</label>
        <textarea
          id="message-supplier-text"
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
          placeholder={t("pd.msgPh")}
          className="mt-3 w-full resize-y rounded-[16px] border border-app-line px-4 py-3 text-[15px] leading-[1.5] outline-none placeholder:text-app-ink-faint focus:border-app-ink"
        />
        <VoiceInputButton value={text} onChange={setText} maxLength={2000} context="a message to a supplier" className="mt-2" />
        {error && <p role="alert" className="mb-0 mt-2 text-[13.5px] font-bold text-app-danger">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !text.trim()} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-bold text-white hover:bg-black disabled:opacity-60">
            <Icon name="send" size={15} /> {pending ? t("pd.sending") : t("pd.send")}
          </button>
          <button type="button" onClick={onClose} className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-bold">{t("pd.cancel")}</button>
        </div>
      </form>
    </dialog>
  );
}
