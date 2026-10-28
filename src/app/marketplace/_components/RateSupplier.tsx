"use client";

import { useEffect, useState } from "react";
import { rateSupplierAction } from "@/app/actions/supplier-reviews";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { RATING_TEXT_MAX, type RatingKind } from "@shared/supplier-ratings";

// "Rate the supplier" (shared/supplier-ratings.ts): 1–5 stars and a short line once a wholesale order, sample or
// dropship parcel has arrived. Used on the seller's wholesale orders (/marketplace/wholesale) and their store
// order page (RateSuppliersOnOrder). The supplier can reply on their Reviews page.

export function StarPicker({ value, onChange, size = 30 }: { value: number; onChange: (value: number) => void; size?: number }) {
  const t = useT("marketplace");
  return (
    <div role="radiogroup" aria-label={t("rate.starsLabel")} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={t("rate.stars", { count: star })}
          onClick={() => onChange(star)}
          className="grid place-items-center rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink"
          style={{ width: size + 8, height: size + 8 }}
        >
          <span aria-hidden style={{ fontSize: size, lineHeight: 1, color: star <= value ? "#F2A93B" : "#D9D4C8" }}>★</span>
        </button>
      ))}
    </div>
  );
}

/** The button and its little form; shows "You rated ★★★★★" once done. */
export function RateSupplier({ kind, orderId, supplierName, rated = null, onRated }: { kind: RatingKind; orderId: string; supplierName: string; rated?: { rating: number; text: string | null } | null; onRated?: (rating: number) => void }) {
  const t = useT("marketplace");
  const [done, setDone] = useState(rated);
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDone(rated), [rated]);

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-app-ink-soft" data-testid={`rated-${orderId}`}>
        {t("rate.youRated")} <span className="text-[#F2A93B]" aria-label={t("rate.stars", { count: done.rating })}>{"★".repeat(done.rating)}</span>
      </span>
    );
  }

  async function send() {
    if (!stars) return setError(t("rate.pickStars"));
    setBusy(true);
    setError(null);
    const result = await rateSupplierAction({ kind, orderId, rating: stars, text: text.trim() || undefined }).catch(() => ({ ok: false as const, error: t("ws.offline") }));
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDone({ rating: result.rating, text: result.text });
    setOpen(false);
    onRated?.(result.rating);
  }

  return open ? (
    <div className="grid w-full gap-2 rounded-[16px] border border-app-line bg-white p-3" data-testid={`rate-form-${orderId}`}>
      <p className="m-0 text-[13.5px] font-extrabold">{t("rate.title", { name: supplierName })}</p>
      <StarPicker value={stars} onChange={setStars} size={26} />
      <label className="sr-only" htmlFor={`rate-text-${orderId}`}>{t("rate.textLabel")}</label>
      <textarea
        id={`rate-text-${orderId}`}
        rows={2}
        maxLength={RATING_TEXT_MAX}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("rate.textPh")}
        className="w-full resize-y rounded-[12px] border border-app-line px-3 py-2 text-[14px] outline-none focus:border-app-ink"
      />
      {error ? <p role="alert" className="m-0 text-[13px] font-bold text-app-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void send()} className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white disabled:opacity-60">{busy ? t("quick.saving") : t("rate.send")}</button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="inline-flex min-h-[40px] items-center rounded-full border border-app-line px-4 text-[13.5px] font-bold">{t("pd.cancel")}</button>
      </div>
    </div>
  ) : (
    <button type="button" data-testid={`rate-${orderId}`} onClick={() => setOpen(true)} className={cx("inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold hover:border-app-line-strong")}>
      <Icon name="star" size={14} /> {t("rate.button")}
    </button>
  );
}

/** On a store order: "Rate the supplier" for each supplier parcel that was delivered (GET /api/app/supplier-ratings). */
export function RateSuppliersOnOrder({ retailOrderId }: { retailOrderId: string }) {
  const t = useT("marketplace");
  const [orders, setOrders] = useState<Array<{ id: string; status: string; supplierName: string; canRate: boolean; rated: { rating: number; text: string | null } | null }>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/app/supplier-ratings?retailOrderId=${encodeURIComponent(retailOrderId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { data?: { orders?: typeof orders } } | null) => !cancelled && setOrders(body?.data?.orders ?? []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [retailOrderId]);
  const shown = orders.filter((order) => order.canRate || order.rated);
  if (!shown.length) return null;
  return (
    <section className="grid gap-2 rounded-[18px] border border-app-line bg-white p-4" data-testid="rate-suppliers">
      <h2 className="m-0 text-[15px] font-extrabold">{t("rate.orderTitle")}</h2>
      <p className="m-0 text-[13px] text-app-ink-soft">{t("rate.orderSub")}</p>
      {shown.map((order) => (
        <div key={order.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[14px] font-bold">{order.supplierName}</span>
          <RateSupplier kind="dropship_order" orderId={order.id} supplierName={order.supplierName} rated={order.rated} />
        </div>
      ))}
    </section>
  );
}
