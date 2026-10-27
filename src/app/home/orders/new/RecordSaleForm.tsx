"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, Segmented, TextInput } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { CHANNEL_LABEL, RECORDED_SALE_CHANNELS, type RecordedSaleChannel } from "@shared/channels";
import { SALE_DELIVERY, SALE_PAYMENTS, saleTotals, type SaleDelivery, type SalePayment } from "@shared/sales";
import { formatMoney } from "@shared/i18n";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { friendlyError } from "@/lib/errors/report-client";
import { findByCode, normalizeShortCode, searchProducts } from "@shared/product-codes";
import { ProductCodeBadge } from "@/components/products/ProductCodeBadge";

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  image: string | null;
  stock: number | null;
  /** The short code customers quote ("BAG2"). */
  shortCode?: string | null;
}

interface Line {
  key: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  image: string | null;
}

const card = "rounded-[22px] border border-app-line bg-white p-5";
const amount = (value: string) => Number(value.replace(/[^\d.]/g, "")) || 0;

export function RecordSaleForm({ products }: { products: CatalogProduct[] }) {
  const t = useT("orders", "common");
  const locale = useLocale();
  const naira = (value: number) => formatMoney(Math.round(value), locale);
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [channel, setChannel] = useState<RecordedSaleChannel>("whatsapp");
  const [payment, setPayment] = useState<SalePayment>("transfer");
  const [delivery, setDelivery] = useState<SaleDelivery>("collected");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Names and codes: typing "bag2" puts BAG2 first.
  const matches = useMemo(() => (search.trim() ? searchProducts(products, search, 8) : products.slice(0, 6)), [products, search]);
  // Find product by code: the code a customer commented ("Comment BAG2 to order").
  const [code, setCode] = useState("");
  const [codeProblem, setCodeProblem] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);

  async function findCode(event?: React.FormEvent | React.KeyboardEvent) {
    event?.preventDefault();
    const typed = normalizeShortCode(code).replace(/\s+/g, "");
    if (!typed) return;
    setCodeProblem(null);
    const local = findByCode(products, typed);
    if (local) {
      addProduct(local);
      setCode("");
      return;
    }
    // Not among the products loaded here: ask the server for that exact code.
    setFinding(true);
    try {
      const response = await fetch(`/api/store/products?code=${encodeURIComponent(typed)}&status=!archived&limit=1`);
      const body = await response.json().catch(() => null);
      const found = response.ok ? (body?.data?.[0] as { id: string; name: string; retailPrice: number; images: string[]; currentStock: number; shortCode: string | null } | undefined) : undefined;
      if (found) {
        addProduct({ id: found.id, name: found.name, price: found.retailPrice, image: found.images[0] ?? null, stock: null, shortCode: found.shortCode });
        setCode("");
      } else setCodeProblem(t("sale.codeNone", { code: typed }));
    } catch {
      setCodeProblem(t("sale.codeNone", { code: typed }));
    } finally {
      setFinding(false);
    }
  }

  const totals = saleTotals(lines, delivery === "deliver" ? amount(deliveryFee) : 0);

  function addProduct(product: CatalogProduct) {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) return current.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { key: product.id, productId: product.id, name: product.name, price: product.price, quantity: 1, image: product.image }];
    });
    setSearch("");
  }

  function addCustom() {
    const name = search.trim();
    setLines((current) => [...current, { key: `custom-${Date.now()}`, productId: null, name, price: 0, quantity: 1, image: null }]);
    setSearch("");
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!lines.length) return setError(t("sale.needItem"));
    if (lines.some((line) => !line.name.trim())) return setError(t("sale.needName"));
    setBusy(true);
    try {
      const response = await fetch("/api/app/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName,
          buyerPhone: buyerPhone || null,
          buyerEmail: buyerEmail || null,
          items: lines.map(({ productId, name, price, quantity }) => ({ productId, name, price, quantity })),
          payment,
          delivery,
          deliveryFee: amount(deliveryFee),
          address: delivery === "deliver" ? { street, city, state: state || undefined } : null,
          channel,
          notes: notes || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? t("sale.saveFailed"));
      router.push(`/home/orders/${body.data.id}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? friendlyError(saveError) : t("sale.saveFailed"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <section className={card}>
        <h2 className="m-0 text-[17px] font-extrabold">{t("sale.whatBought")}</h2>
        <div className="mt-3 flex items-center gap-2">
          <TextInput
            aria-label={t("sale.codeFind")}
            placeholder={t("sale.codePlaceholder")}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") void findCode(event);
            }}
            className="min-w-0 max-w-[220px] font-mono uppercase tracking-[0.08em]"
          />
          <PillButton type="button" tone="white" size="md" onClick={() => void findCode()} disabled={finding || !code.trim()}>{t("sale.codeFind")}</PillButton>
        </div>
        {codeProblem ? <p className="m-0 mt-2 text-[13px] font-semibold text-app-danger">{codeProblem}</p> : null}
        <div className="relative mt-3">
          <TextInput
            aria-label={t("sale.searchAria")}
            placeholder={t("sale.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {(matches.length > 0 || search.trim()) && (
          <ul className="m-0 mt-2 grid list-none gap-1 p-0">
            {matches.map((product) => (
              <li key={product.id}>
                <button type="button" onClick={() => addProduct(product)} className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left hover:bg-app-canvas">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image} alt="" className="h-10 w-10 rounded-[10px] object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-app-canvas text-[13px] font-extrabold">{product.name.charAt(0)}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-start gap-2 sm:items-center">
                      <span className="line-clamp-2 min-w-0 break-words text-[14px] font-bold sm:line-clamp-1">{product.name}</span>
                      {product.shortCode ? <ProductCodeBadge code={product.shortCode} /> : null}
                    </span>
                    <span className="block text-[12.5px] text-app-ink-soft">{naira(product.price)}{product.stock === null ? null : <> · {product.stock > 0 ? t("sale.inStock", { count: product.stock }) : t("sale.soldOut")}</>}</span>
                  </span>
                  <span className="shrink-0 text-[13px] font-extrabold text-app-accent-ink">{t("sale.add")}</span>
                </button>
              </li>
            ))}
            {search.trim() && (
              <li>
                <button type="button" onClick={addCustom} className="w-full rounded-[14px] px-2 py-2.5 text-left text-[14px] font-bold text-app-accent-ink hover:bg-app-canvas">
                  {t("sale.addCustom", { name: search.trim() })}
                </button>
              </li>
            )}
          </ul>
        )}

        {lines.length > 0 && (
          <ul className="m-0 mt-4 grid list-none gap-2 border-t border-app-line p-0 pt-4">
            {lines.map((line) => (
              <li key={line.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] bg-app-canvas p-3 sm:grid-cols-[minmax(0,1fr)_130px_120px_auto]">
                <TextInput aria-label={t("sale.itemName")} value={line.name} onChange={(event) => update(line.key, { name: event.target.value })} className="col-span-2 sm:col-span-1" />
                <TextInput aria-label={t("sale.priceFor", { name: line.name || t("sale.item") })} inputMode="numeric" value={line.price ? String(line.price) : ""} placeholder={t("sale.pricePlaceholder")} onChange={(event) => update(line.key, { price: amount(event.target.value) })} />
                <div className="flex items-center gap-1" role="group" aria-label={t("sale.qtyOf", { name: line.name || t("sale.item") })}>
                  <button type="button" aria-label={t("sale.fewer")} onClick={() => update(line.key, { quantity: Math.max(1, line.quantity - 1) })} className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-[18px] font-bold">−</button>
                  <span className="w-8 text-center text-[15px] font-extrabold" aria-live="polite">{line.quantity}</span>
                  <button type="button" aria-label={t("sale.more")} onClick={() => update(line.key, { quantity: line.quantity + 1 })} className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-[18px] font-bold">+</button>
                </div>
                <button type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="text-[13px] font-bold text-app-danger">{t("remove")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="m-0 text-[17px] font-extrabold">{t("sale.whoBought")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="sale-name">{t("sale.customerName")}</FieldLabel>
            <TextInput id="sale-name" required value={buyerName} onChange={(event) => setBuyerName(event.target.value)} autoComplete="off" />
          </div>
          <div>
            <FieldLabel htmlFor="sale-phone">{t("sale.phone")}</FieldLabel>
            <TextInput id="sale-phone" type="tel" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="sale-email">{t("sale.email")}</FieldLabel>
            <TextInput id="sale-email" type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} autoComplete="off" />
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[14px] font-bold">{t("sale.where")}</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("sale.where")}>
            {RECORDED_SALE_CHANNELS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={channel === key}
                onClick={() => setChannel(key)}
                className={cx("min-h-[40px] rounded-full border px-4 text-[14px] font-bold", channel === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}
              >
                {t.dynamic(`channel.${CHANNEL_LABEL[key]}`, CHANNEL_LABEL[key])}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="m-0 text-[17px] font-extrabold">{t("sale.payDelivery")}</h2>
        <div className="mt-3 grid gap-4">
          <Segmented options={SALE_PAYMENTS.map((option) => ({ value: option.key, label: t(`salePay.${option.key}`) }))} value={payment} onChange={setPayment} />
          <Segmented options={SALE_DELIVERY.map((option) => ({ value: option.key, label: t(`saleDel.${option.key}`) }))} value={delivery} onChange={setDelivery} />
          {delivery === "deliver" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="sale-street">{t("sale.address")}</FieldLabel>
                <TextInput id="sale-street" required value={street} onChange={(event) => setStreet(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="sale-city">{t("sale.city")}</FieldLabel>
                <TextInput id="sale-city" required value={city} onChange={(event) => setCity(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="sale-state">{t("sale.state")}</FieldLabel>
                <TextInput id="sale-state" value={state} onChange={(event) => setState(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="sale-fee">{t("sale.fee")}</FieldLabel>
                <TextInput id="sale-fee" inputMode="numeric" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} placeholder="0" />
              </div>
            </div>
          )}
          <div>
            <FieldLabel htmlFor="sale-notes">{t("sale.note")}</FieldLabel>
            <TextInput id="sale-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("sale.notePlaceholder")} />
            <VoiceInputButton value={notes} onChange={setNotes} context="a note about a sale" className="mt-2" />
          </div>
        </div>
      </section>

      {error && <Notice>{error}</Notice>}
      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-app-ink px-5 py-4 text-white shadow-lg">
        <div>
          <div className="text-[13px] text-white/70">{payment === "unpaid" ? t("sale.toCollect") : t("sale.total")}</div>
          <div className="text-[24px] font-extrabold tracking-[-0.4px]">{naira(totals.total)}</div>
        </div>
        <PillButton type="submit" tone="accent" busy={busy}>{t("sale.save")}</PillButton>
      </div>
    </form>
  );
}
