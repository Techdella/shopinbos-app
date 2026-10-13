"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FieldLabel, Notice, PillButton, Segmented, TextInput } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { CHANNEL_LABEL, RECORDED_SALE_CHANNELS, type RecordedSaleChannel } from "@shared/channels";
import { SALE_DELIVERY, SALE_PAYMENTS, saleTotals, type SaleDelivery, type SalePayment } from "@shared/sales";
import { naira } from "@shared/onboarding";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  image: string | null;
  stock: number;
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

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products.slice(0, 6);
    return products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, 8);
  }, [products, search]);

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
    if (!lines.length) return setError("Add at least one item.");
    if (lines.some((line) => !line.name.trim())) return setError("Every item needs a name.");
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
      if (!response.ok) throw new Error(body?.error?.message ?? "Couldn't save this sale. Try again.");
      router.push(`/home/orders/${body.data.id}`);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save this sale. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <section className={card}>
        <h2 className="m-0 text-[17px] font-extrabold">What did they buy?</h2>
        <div className="relative mt-3">
          <TextInput
            aria-label="Search your products"
            placeholder="Search your products, or type something new"
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
                    <span className="block truncate text-[14px] font-bold">{product.name}</span>
                    <span className="block text-[12.5px] text-app-ink-soft">{naira(product.price)} · {product.stock > 0 ? `${product.stock} in stock` : "Sold out"}</span>
                  </span>
                  <span className="text-[13px] font-extrabold text-app-accent-ink">Add</span>
                </button>
              </li>
            ))}
            {search.trim() && (
              <li>
                <button type="button" onClick={addCustom} className="w-full rounded-[14px] px-2 py-2.5 text-left text-[14px] font-bold text-app-accent-ink hover:bg-app-canvas">
                  + Add &ldquo;{search.trim()}&rdquo; (not in your store)
                </button>
              </li>
            )}
          </ul>
        )}

        {lines.length > 0 && (
          <ul className="m-0 mt-4 grid list-none gap-2 border-t border-app-line p-0 pt-4">
            {lines.map((line) => (
              <li key={line.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] bg-app-canvas p-3 sm:grid-cols-[minmax(0,1fr)_130px_120px_auto]">
                <TextInput aria-label="Item name" value={line.name} onChange={(event) => update(line.key, { name: event.target.value })} className="col-span-2 sm:col-span-1" />
                <TextInput aria-label={`Price for ${line.name || "item"}`} inputMode="numeric" value={line.price ? String(line.price) : ""} placeholder="Price (₦)" onChange={(event) => update(line.key, { price: amount(event.target.value) })} />
                <div className="flex items-center gap-1" role="group" aria-label={`Quantity of ${line.name || "item"}`}>
                  <button type="button" aria-label="One fewer" onClick={() => update(line.key, { quantity: Math.max(1, line.quantity - 1) })} className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-[18px] font-bold">−</button>
                  <span className="w-8 text-center text-[15px] font-extrabold" aria-live="polite">{line.quantity}</span>
                  <button type="button" aria-label="One more" onClick={() => update(line.key, { quantity: line.quantity + 1 })} className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-[18px] font-bold">+</button>
                </div>
                <button type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="text-[13px] font-bold text-app-danger">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="m-0 text-[17px] font-extrabold">Who bought it?</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="sale-name">Customer name</FieldLabel>
            <TextInput id="sale-name" required value={buyerName} onChange={(event) => setBuyerName(event.target.value)} autoComplete="off" />
          </div>
          <div>
            <FieldLabel htmlFor="sale-phone">Phone or WhatsApp (optional)</FieldLabel>
            <TextInput id="sale-phone" type="tel" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} autoComplete="off" />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="sale-email">Email (optional, for a receipt later)</FieldLabel>
            <TextInput id="sale-email" type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} autoComplete="off" />
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[14px] font-bold">Where did they buy?</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where did they buy?">
            {RECORDED_SALE_CHANNELS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={channel === key}
                onClick={() => setChannel(key)}
                className={cx("min-h-[40px] rounded-full border px-4 text-[14px] font-bold", channel === key ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink")}
              >
                {CHANNEL_LABEL[key]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="m-0 text-[17px] font-extrabold">Payment and delivery</h2>
        <div className="mt-3 grid gap-4">
          <Segmented options={SALE_PAYMENTS.map((option) => ({ value: option.key, label: option.label }))} value={payment} onChange={setPayment} />
          <Segmented options={SALE_DELIVERY.map((option) => ({ value: option.key, label: option.label }))} value={delivery} onChange={setDelivery} />
          {delivery === "deliver" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="sale-street">Delivery address</FieldLabel>
                <TextInput id="sale-street" required value={street} onChange={(event) => setStreet(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="sale-city">Area or city</FieldLabel>
                <TextInput id="sale-city" required value={city} onChange={(event) => setCity(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="sale-state">State</FieldLabel>
                <TextInput id="sale-state" value={state} onChange={(event) => setState(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="sale-fee">Delivery fee the customer pays (₦)</FieldLabel>
                <TextInput id="sale-fee" inputMode="numeric" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} placeholder="0" />
              </div>
            </div>
          )}
          <div>
            <FieldLabel htmlFor="sale-notes">Note (optional)</FieldLabel>
            <TextInput id="sale-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Size M, gift wrap" />
            <VoiceInputButton value={notes} onChange={setNotes} context="a note about a sale" className="mt-2" />
          </div>
        </div>
      </section>

      {error && <Notice>{error}</Notice>}
      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-[22px] bg-app-ink px-5 py-4 text-white shadow-lg">
        <div>
          <div className="text-[13px] text-white/70">{payment === "unpaid" ? "To collect" : "Sale total"}</div>
          <div className="text-[24px] font-extrabold tracking-[-0.4px]">{naira(totals.total)}</div>
        </div>
        <PillButton type="submit" tone="accent" busy={busy}>Save sale</PillButton>
      </div>
    </form>
  );
}
