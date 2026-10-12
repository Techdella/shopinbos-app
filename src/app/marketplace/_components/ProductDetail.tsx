"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { addSupplierProductToStore, messageSupplier, requestSupplierQuote, toggleSavedProduct } from "@/app/actions/sourcing";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { clampSellingPrice, naira, priceStep, saleBreakdown, supplierInitials, tierPrice, type FindProduct } from "@/lib/marketplace/find";
import { SampleNotice } from "./SampleNotice";
import { messagesHref } from "@/lib/conversations/pure";

const CARD = "rounded-[20px] border border-app-line bg-white";

/** Product page in Find products: price it, see the money on each sale, add it, or buy wholesale. */
export function ProductDetail({ product, added: addedAtStart, saved: savedAtStart, notified }: { product: FindProduct; added: boolean; saved: boolean; notified: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"dropship" | "wholesale">(product.dropship ? "dropship" : "wholesale");
  const [price, setPrice] = useState(() => clampSellingPrice(product.price, product.cost));
  const [quantity, setQuantity] = useState(product.moq);
  const [image, setImage] = useState(0);
  const [added, setAdded] = useState(addedAtStart);
  const [saved, setSaved] = useState(savedAtStart);
  const [quoted, setQuoted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [pending, start] = useTransition();

  const sale = saleBreakdown(price, product.cost);
  const step = priceStep(price);
  const unit = tierPrice(product.tiers, quantity, product.cost);
  const supplier = product.supplier;
  const meta = [
    supplier.name,
    supplier.city,
    supplier.rating ? `★ ${supplier.rating.toFixed(1)}` : "",
    product.ships,
    supplier.onTimePct ? `${supplier.onTimePct}% on time` : "",
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
        const result = await addSupplierProductToStore({ supplierProductId: product.id, retailPrice: price });
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

  return (
    <div className="grid min-w-0 gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/marketplace"))}
            aria-label="Back"
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
        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={pending} aria-pressed={saved} className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-extrabold hover:border-app-line-strong disabled:opacity-60">
            <Icon name="heart" size={15} fill={saved ? "currentColor" : "none"} className={saved ? "text-app-accent" : ""} /> {saved ? "Saved" : "Save"}
          </button>
          <button type="button" onClick={() => guard(() => setMessageOpen(true))} className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[14px] font-extrabold hover:border-app-line-strong">
            <Icon name="chat" size={15} /> Message supplier
          </button>
        </div>
      </header>

      {product.sample && (
        <p className="m-0 flex flex-wrap items-center gap-2 rounded-[14px] border border-dashed border-app-line-strong bg-white px-3.5 py-2.5 text-[13.5px] text-app-ink-soft">
          <span className="rounded-full bg-[#FDF0D5] px-2.5 py-0.5 text-[12px] font-extrabold text-[#8A5A00]">Sample product</span>
          Suppliers are joining. This shows how selling a supplier&apos;s product works.
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
                  aria-label={`Photo ${index + 1}`}
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
          <div role="tablist" aria-label="How you sell it" className="grid grid-cols-2 gap-1 rounded-full bg-white p-1">
            {([["dropship", "Dropship · no stock"], ["wholesale", "Buy wholesale"]] as const).map(([value, label]) => {
              const disabled = value === "dropship" ? !product.dropship : !product.wholesale;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  disabled={disabled}
                  onClick={() => setMode(value)}
                  className={cx("min-h-[40px] rounded-full px-3 text-[13.5px] font-extrabold disabled:cursor-not-allowed disabled:opacity-40", mode === value ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas")}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {mode === "dropship" ? (
            <>
              <section className={cx(CARD, "p-4 text-center")}>
                <h2 className="m-0 text-[13px] font-bold text-app-ink-soft">Your selling price</h2>
                <div className="mx-auto mt-2 inline-flex items-center gap-3 rounded-full bg-app-canvas p-1">
                  <button type="button" aria-label={`Lower the price by ${naira(step)}`} onClick={() => setPrice((value) => clampSellingPrice(value - priceStep(value - 1), product.cost))} className="grid h-10 w-10 place-items-center rounded-full bg-white text-[18px] font-extrabold">
                    <Icon name="minus" size={16} />
                  </button>
                  <output aria-live="polite" className="min-w-[120px] text-[24px] font-extrabold tracking-[-0.5px]">{naira(price)}</output>
                  <button type="button" aria-label={`Raise the price by ${naira(step)}`} onClick={() => setPrice((value) => clampSellingPrice(value + priceStep(value), product.cost))} className="grid h-10 w-10 place-items-center rounded-full bg-app-ink text-white">
                    <Icon name="plus" size={16} />
                  </button>
                </div>
                {product.similar && (
                  <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">Similar items sell for {naira(product.similar[0])} to {naira(product.similar[1])}</p>
                )}
              </section>

              <section className={cx(CARD, "p-4")}>
                <h2 className="m-0 text-[14.5px] font-extrabold">On each sale</h2>
                <dl className="m-0 mt-2 grid gap-2 text-[14px]">
                  <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Shopper pays you</dt><dd className="m-0 font-bold">{naira(sale.shopperPays)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="min-w-0 truncate text-app-ink-soft">{supplier.name} gets</dt><dd className="m-0 font-bold">−{naira(sale.supplierGets)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Payment fee</dt><dd className="m-0 font-bold">−{naira(sale.fee)}</dd></div>
                </dl>
                <div className="mt-3 border-t border-app-line pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14.5px] font-extrabold">You keep</span>
                    <span className={cx("text-[17px] font-extrabold", sale.keep > 0 ? "text-app-success" : "text-app-danger")}>{naira(sale.keep)} · {sale.keepPct}%</span>
                  </div>
                  <p className="mb-0 mt-1 text-[12.5px] text-app-ink-soft">Delivery is added at checkout and goes to the rider.</p>
                </div>
              </section>

              {added ? (
                <div role="status" className="flex min-h-[54px] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full bg-app-success-tint px-5 text-[15px] font-extrabold text-app-success">
                  <span className="inline-flex items-center gap-2"><Icon name="check" size={17} /> Added to your store</span>
                  <Link href="/products" className="text-app-success underline-offset-2 hover:underline">View in products</Link>
                </div>
              ) : (
                <button type="button" onClick={add} disabled={pending} className="inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-app-accent px-5 text-[15.5px] font-extrabold text-white hover:brightness-95 disabled:opacity-60">
                  {pending ? "Adding…" : <>Add to my store at&nbsp;{naira(price)}</>}
                </button>
              )}
            </>
          ) : (
            <>
              <section className={cx(CARD, "p-4")}>
                <h2 className="m-0 text-[14.5px] font-extrabold">Buy wholesale</h2>
                <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">Minimum order {product.moq.toLocaleString("en-NG")}. You hold the stock and sell it at your price.</p>
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[14px]">
                  {(product.tiers.length ? product.tiers : [{ minQty: product.moq, price: product.cost }]).map((tier) => (
                    <li key={tier.minQty} className={cx("flex justify-between gap-3 rounded-[12px] px-3 py-2", unit === tier.price && quantity >= tier.minQty ? "bg-app-canvas font-bold" : "")}>
                      <span>{tier.minQty.toLocaleString("en-NG")}{"maxQty" in tier && tier.maxQty ? `–${tier.maxQty.toLocaleString("en-NG")}` : "+"} units</span>
                      <span>{naira(tier.price)} each</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-app-line pt-3">
                  <label htmlFor="wholesale-qty" className="text-[14px] font-bold">How many</label>
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
                  <span className="text-[13.5px] text-app-ink-soft">{naira(unit)} each</span>
                  <span className="text-[17px] font-extrabold">{naira(unit * quantity)}</span>
                </div>
              </section>
              {quoted ? (
                <p role="status" className="m-0 rounded-[16px] bg-app-success-tint px-4 py-3 text-[14px] font-extrabold text-app-success">
                  Quote requested. {supplier.name} will send their price for {quantity.toLocaleString("en-NG")} units.
                </p>
              ) : (
                <button type="button" onClick={quote} disabled={pending} className="inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-app-ink px-5 text-[15.5px] font-extrabold text-white hover:bg-black disabled:opacity-60">
                  {pending ? "Sending…" : "Request a quote"}
                </button>
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
                {supplier.verified && <><Icon name="checkCircle" size={14} className="text-app-success" /> Verified by Shopinbos</>}
                {product.stock > 0 && <span>{supplier.verified ? "· " : ""}{product.stock.toLocaleString("en-NG")} in stock</span>}
              </div>
            </div>
          </section>
        </div>
        <div className="grid min-w-0 gap-4 lg:col-start-1">
          <section className={cx(CARD, "p-4 sm:p-5")}>
            <h2 className="m-0 text-[15px] font-extrabold">What happens when it sells</h2>
            <ol className="m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-2">
              {[
                "The shopper pays you. Shopinbos holds the money.",
                `${supplier.name} packs it with your label.`,
                "A rider delivers. Peggy tracks it in your name.",
                "48 hours after delivery the money splits.",
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
              <h2 className="m-0 text-[15px] font-extrabold">About this product</h2>
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
        <h2 id="message-supplier-title" className="m-0 text-[19px] font-extrabold">Message {supplierName}</h2>
        <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">About {productName}. Their reply comes to your Inbox.</p>
        <label htmlFor="message-supplier-text" className="sr-only">Your message</label>
        <textarea
          id="message-supplier-text"
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={2000}
          placeholder="Hi, can you do my label on the box? How fast can you ship to Abuja?"
          className="mt-3 w-full resize-y rounded-[16px] border border-app-line px-4 py-3 text-[15px] leading-[1.5] outline-none placeholder:text-app-ink-faint focus:border-app-ink"
        />
        {error && <p role="alert" className="mb-0 mt-2 text-[13.5px] font-bold text-app-danger">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !text.trim()} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white hover:bg-black disabled:opacity-60">
            <Icon name="send" size={15} /> {pending ? "Sending…" : "Send"}
          </button>
          <button type="button" onClick={onClose} className="inline-flex min-h-[44px] items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold">Cancel</button>
        </div>
      </form>
    </dialog>
  );
}
