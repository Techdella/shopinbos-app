"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Modal } from "@/components/growth/Modal";
import { FieldLabel, Notice, PillButton, TextInput, Toggle } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { naira } from "@shared/onboarding";
import { EXPIRY_CHOICES, deliveryFromForm as deliveryBody, whatsappShareUrl, type ExpiryChoice } from "@/lib/payment-links/pure";
import { regionsFor } from "@/components/storefront/shopper/checkout-storage";
import { QrCode } from "./QrCode";

/** The states the pay page's address form offers (the same names, so a saved state matches). */
const NG_REGIONS = regionsFor("Nigeria");

// Make a payment link for one or more of the seller's products: pick the option (or let the customer choose), how
// many, one-time or reusable, how long it works, and optionally an agreed price and the customer's details. Then
// copy it, send it on WhatsApp or show a QR code.

export interface LinkProduct {
  id: string;
  name: string;
  price: number;
  image: string | null;
  options: Array<{ id: string; name: string; price: number }>;
}

interface Line {
  productId: string;
  variantId: string | null;
  quantity: number;
}

interface Created {
  url: string;
  title: string;
  total: number;
}

export function PaymentLinkDialog({
  catalog,
  initialProductIds = [],
  storeName,
  ready = true,
  onClose,
  onCreated,
}: {
  catalog: LinkProduct[];
  initialProductIds?: string[];
  storeName: string;
  /** False when the shop has no way to take payment yet. */
  ready?: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const t = useT("paylinks");
  const byId = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);
  const [lines, setLines] = useState<Line[]>(() => initialProductIds.filter((id) => byId.has(id)).map((id) => ({ productId: id, variantId: null, quantity: 1 })));
  const [query, setQuery] = useState("");
  const [oneTime, setOneTime] = useState(true);
  const [expiry, setExpiry] = useState<ExpiryChoice>("7d");
  const [more, setMore] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  // Optional saved delivery: the customer's address and the fee, so the customer only taps Pay.
  const [withDelivery, setWithDelivery] = useState(false);
  const [delivery, setDelivery] = useState({ street: "", city: "", state: "", landmark: "", fee: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const showPicker = catalog.length > 1 || lines.length === 0;
  const matches = query.trim() ? catalog.filter((product) => product.name.toLowerCase().includes(query.trim().toLowerCase()) && !lines.some((line) => line.productId === product.id)).slice(0, 8) : [];
  const estimate = lines.reduce((sum, line) => {
    const product = byId.get(line.productId);
    const option = product?.options.find((entry) => entry.id === line.variantId);
    return sum + (option?.price ?? product?.price ?? 0) * line.quantity;
  }, 0);

  function update(index: number, change: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...change } : line)));
  }

  async function create() {
    setError(null);
    if (!lines.length) return setError(t("dialog.pickFirst"));
    const savedDelivery = withDelivery ? deliveryBody(delivery) : null;
    if (withDelivery && !savedDelivery) return setError(t("dialog.deliveryIncomplete"));
    setBusy(true);
    try {
      const response = await fetch("/api/app/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines,
          oneTime,
          expiry,
          customAmount: amount.trim() ? Number(amount.replace(/[^\d.]/g, "")) : null,
          note: note.trim() || null,
          buyerName: buyerName.trim() || null,
          buyerPhone: buyerPhone.trim() || null,
          delivery: savedDelivery,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError(json?.error?.message ?? t("dialog.failed"));
        return;
      }
      const data = json.data as { url: string; total: number; items: Array<{ name?: string }> };
      const names = data.items.map((item) => item.name).filter(Boolean) as string[];
      setCreated({ url: data.url, total: data.total, title: names.length > 1 ? `${names[0]} + ${names.length - 1}` : names[0] ?? storeName });
      onCreated?.();
    } catch {
      setError(t("dialog.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  if (created) {
    const message = t("done.message", { title: created.title, store: storeName, url: created.url });
    const canShare = typeof navigator !== "undefined" && "share" in navigator;
    return (
      <Modal title={t("done.title")} onClose={onClose}>
        <p className="m-0 text-[14.5px] text-app-ink-soft">{t("done.sub")}</p>
        <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-app-line bg-app-canvas px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{created.url}</span>
        </div>
        <p className="mb-0 mt-2 text-[14px] font-bold">{naira(created.total)}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <PillButton size="md" tone="ink" onClick={() => copy(created.url)}>
            <Icon name={copied ? "check" : "copy"} size={16} />
            {copied ? t("done.copied") : t("done.copy")}
          </PillButton>
          <a href={whatsappShareUrl(message, buyerPhone)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-app-forest px-5 text-[15px] font-bold text-white no-underline">
            <Icon name="whatsapp" size={16} />
            {t("done.whatsapp")}
          </a>
          {canShare ? (
            <PillButton size="md" tone="white" onClick={() => void navigator.share({ text: message }).catch(() => null)} className="sm:col-span-2">
              <Icon name="send" size={16} />
              {t("done.share")}
            </PillButton>
          ) : null}
        </div>
        <div className="mt-5 flex flex-col items-center gap-2">
          <QrCode value={created.url} label={t("done.qr")} />
          <span className="text-[12.5px] text-app-ink-soft">{t("done.qr")}</span>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <PillButton size="md" tone="white" onClick={() => { setCreated(null); setCopied(false); }}>{t("done.another")}</PillButton>
          <PillButton size="md" tone="ink" onClick={onClose}>{t("done.close")}</PillButton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("dialog.title")} onClose={onClose}>
      <p className="m-0 text-[14.5px] leading-[1.5] text-app-ink-soft">{t("dialog.sub")}</p>
      {!ready ? (
        <div className="mt-3">
          <Notice tone="info">
            {t("dialog.notReady")} <Link href="/home/payments" className="font-bold underline">{t("dialog.setUpPayments")}</Link>
          </Notice>
        </div>
      ) : null}

      <h3 className="mb-2 mt-5 text-[15px] font-extrabold">{t("dialog.products")}</h3>
      <ul className="m-0 grid list-none gap-3 p-0">
        {lines.map((line, index) => {
          const product = byId.get(line.productId);
          if (!product) return null;
          return (
            <li key={line.productId} className="rounded-[16px] border border-app-line p-3">
              <div className="flex items-center gap-3">
                <span className="block h-12 w-12 shrink-0 overflow-hidden rounded-[10px] bg-app-canvas">{product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold">{product.name}</span>
                  <span className="block text-[13px] text-app-ink-soft">{naira(product.options.find((o) => o.id === line.variantId)?.price ?? product.price)}</span>
                </span>
                {catalog.length > 1 ? (
                  <button type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))} aria-label={t("dialog.remove")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-app-canvas">
                    <Icon name="x" size={16} />
                  </button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                {product.options.length > 0 ? (
                  <div>
                    <FieldLabel htmlFor={`pl-opt-${index}`}>{t("dialog.option")}</FieldLabel>
                    <select id={`pl-opt-${index}`} value={line.variantId ?? ""} onChange={(event) => update(index, { variantId: event.target.value || null })} className="h-12 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px]">
                      <option value="">{t("dialog.optionOpen")}</option>
                      {product.options.map((option) => <option key={option.id} value={option.id}>{option.name} · {naira(option.price)}</option>)}
                    </select>
                  </div>
                ) : <span className="hidden sm:block" />}
                <div>
                  <FieldLabel htmlFor={`pl-qty-${index}`}>{t("dialog.quantity")}</FieldLabel>
                  <TextInput id={`pl-qty-${index}`} inputMode="numeric" value={String(line.quantity)} onChange={(event) => update(index, { quantity: Math.min(50, Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1)) })} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {showPicker ? (
        <div className="mt-3">
          <FieldLabel htmlFor="pl-search">{t("dialog.pick")}</FieldLabel>
          <TextInput id="pl-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("dialog.search")} />
          {query.trim() ? (
            matches.length ? (
              <ul className="m-0 mt-2 grid list-none gap-1 p-0">
                {matches.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setLines((prev) => [...prev, { productId: product.id, variantId: null, quantity: 1 }].slice(0, 10));
                        setQuery("");
                      }}
                      className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-2 text-left hover:bg-app-canvas"
                    >
                      <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-[8px] bg-app-canvas">{product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : null}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{product.name}</span>
                      <span className="text-[13px] text-app-ink-soft">{naira(product.price)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[13.5px] text-app-ink-soft">{t("dialog.noMatch")}</p>
            )
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4">
        <div>
          <Toggle on={oneTime} onChange={setOneTime} label={t("dialog.oneTime")} />
          <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">{t("dialog.oneTimeHint")}</p>
        </div>
        <div>
          <FieldLabel htmlFor="pl-expiry">{t("dialog.expiry")}</FieldLabel>
          <select id="pl-expiry" value={expiry} onChange={(event) => setExpiry(event.target.value as ExpiryChoice)} className="h-12 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px]">
            {EXPIRY_CHOICES.map((choice) => <option key={choice} value={choice}>{t(`expiry.${choice}`)}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => setMore((open) => !open)} aria-expanded={more} className="inline-flex min-h-11 items-center gap-1.5 justify-self-start text-[14px] font-bold">
          <Icon name="chevDown" size={14} className={cx(more && "rotate-180")} />
          {t("dialog.more")}
        </button>
        {more ? (
          <div className="grid gap-3">
            <div>
              <FieldLabel htmlFor="pl-amount">{t("dialog.amount")}</FieldLabel>
              <TextInput id="pl-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))} placeholder={estimate ? String(Math.round(estimate)) : ""} />
              <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">{t("dialog.amountHint")}</p>
            </div>
            <div>
              <FieldLabel htmlFor="pl-note">{t("dialog.note")}</FieldLabel>
              <TextInput id="pl-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="pl-buyer">{t("dialog.buyerName")}</FieldLabel>
                <TextInput id="pl-buyer" value={buyerName} maxLength={120} onChange={(event) => setBuyerName(event.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="pl-phone">{t("dialog.buyerPhone")}</FieldLabel>
                <TextInput id="pl-phone" type="tel" value={buyerPhone} maxLength={40} onChange={(event) => setBuyerPhone(event.target.value)} />
              </div>
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 rounded-[16px] border border-app-line p-3">
          <Toggle on={withDelivery} onChange={setWithDelivery} label={t("dialog.delivery")} />
          <p className="m-0 text-[13px] text-app-ink-soft">{t("dialog.deliveryHint")}</p>
          {withDelivery ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="pl-street">{t("dialog.deliveryStreet")}</FieldLabel>
                <TextInput id="pl-street" value={delivery.street} maxLength={200} autoComplete="off" onChange={(event) => setDelivery((prev) => ({ ...prev, street: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="pl-city">{t("dialog.deliveryCity")}</FieldLabel>
                <TextInput id="pl-city" value={delivery.city} maxLength={120} autoComplete="off" onChange={(event) => setDelivery((prev) => ({ ...prev, city: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="pl-state">{t("dialog.deliveryState")}</FieldLabel>
                <select id="pl-state" value={delivery.state} onChange={(event) => setDelivery((prev) => ({ ...prev, state: event.target.value }))} className="h-12 w-full rounded-[14px] border border-app-line bg-white px-3 text-[15px]">
                  <option value="">{t("dialog.deliveryPickState")}</option>
                  {NG_REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="pl-landmark">{t("dialog.deliveryLandmark")}</FieldLabel>
                <TextInput id="pl-landmark" value={delivery.landmark} maxLength={160} autoComplete="off" onChange={(event) => setDelivery((prev) => ({ ...prev, landmark: event.target.value }))} />
              </div>
              <div>
                <FieldLabel htmlFor="pl-fee">{t("dialog.deliveryFee")}</FieldLabel>
                <TextInput id="pl-fee" inputMode="decimal" value={delivery.fee} placeholder="0" onChange={(event) => setDelivery((prev) => ({ ...prev, fee: event.target.value.replace(/[^\d.,]/g, "") }))} />
                <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">{t("dialog.deliveryFeeHint")}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? <div className="mt-4"><Notice>{error}</Notice></div> : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[15px] font-extrabold">{amount.trim() || estimate ? naira((amount.trim() ? Number(amount.replace(/[^\d.]/g, "")) || 0 : estimate) + (withDelivery ? deliveryBody(delivery)?.fee ?? 0 : 0)) : ""}</span>
        <PillButton size="md" tone="ink" busy={busy} onClick={create} disabled={!lines.length}>
          <Icon name="link" size={16} />
          {t("dialog.create")}
        </PillButton>
      </div>
    </Modal>
  );
}
