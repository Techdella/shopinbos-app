"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card, Pill, Thumb } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, cx } from "@/components/app-ui";
import { Modal } from "@/components/growth/Modal";
import { textareaClass } from "@/components/growth/kit";
import { sellerCanCancelWholesale, sellerWholesaleStage, SELLER_CANCEL_PREFIX } from "@/lib/supplier-orders/pure";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney, formatNumber, type Locale } from "@shared/i18n";
import { localWholesaleStage } from "./wholesaleStage";
import { RateSupplier } from "./RateSupplier";

// The seller's wholesale orders (/marketplace/wholesale): every order they placed with a supplier, its stage, and
// "Cancel order" while the supplier hasn't started packing (PATCH /api/app/wholesale/[id] { action: "cancel" }).
// The server gives the reserved stock back once and tells the supplier; a repeat answers 409. Once the supplier
// accepts, "Pay ₦X" pays by card, split straight to the supplier's bank (PATCH … { action: "pay" } → Paystack →
// back to this page, which confirms the payment).

export interface SellerWholesaleRow {
  id: string;
  ref: string;
  status: string;
  rejectReason: string | null;
  trackingCode: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  currency: string;
  /** Preformatted on the server (Lagos time) so server and browser render the same text. */
  placed: string;
  supplier: { name: string; slug: string | null };
  product: { id: string; name: string; image: string | null };
  /** Paid by card in Shopinbos (straight to the supplier's bank). */
  paid: boolean;
  /** Accepted by the supplier, not paid yet, and the supplier takes card payments. */
  canPay: boolean;
  /** What "Pay" pays now in kobo, when it isn't the whole total (a preorder deposit, or the rest after it). */
  payKobo?: number | null;
  /** Stock preordered before it arrives: the supplier's ship date, preformatted (null: when it arrives). */
  preorder?: { ships: string | null } | null;
  /** One piece at the dropship price to try it (shared/samples.ts). */
  sample?: boolean;
  /** It arrived: the seller can rate the supplier (shared/supplier-ratings.ts); `rated` once they did. */
  canRate?: boolean;
  rated?: { rating: number; text: string | null } | null;
}

function money(amount: number, currency: string, locale: Locale) {
  if (locale !== "en") return formatMoney(Math.round(amount), locale, { currency });
  const value = Math.round(amount).toLocaleString("en-NG");
  return currency === "NGN" ? `₦${value}` : `${currency} ${value}`;
}

export function WholesaleOrders({ initial }: { initial: SellerWholesaleRow[] }) {
  const router = useRouter();
  const t = useT("marketplace");
  const locale = useLocale();
  const num = (value: number) => (locale === "en" ? value.toLocaleString("en-NG") : formatNumber(value, locale));
  const [rows, setRows] = useState(initial);
  // A refresh (after a 409: the order moved on elsewhere) brings the server's view of every row.
  useEffect(() => setRows(initial), [initial]);
  const [cancelling, setCancelling] = useState<SellerWholesaleRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);

  function openCancel(row: SellerWholesaleRow) {
    setCancelling(row);
    setReason("");
    setError(null);
    setNotice(null);
  }

  function close() {
    if (busy) return;
    setCancelling(null);
    setError(null);
  }

  async function pay(row: SellerWholesaleRow) {
    setPaying(row.id);
    setNotice(null);
    setPayError(null);
    try {
      const response = await fetch(`/api/app/wholesale/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay" }) });
      const json = (await response.json().catch(() => null)) as { data?: { authorizationUrl?: string | null }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.authorizationUrl) {
        setPayError(json?.error?.message ?? t("ws.payError"));
        setPaying(null);
        return;
      }
      window.location.assign(json.data.authorizationUrl);
    } catch {
      setPayError(t("ws.offline"));
      setPaying(null);
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/app/wholesale/${encodeURIComponent(cancelling.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", ...(reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { id: string; status: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) {
        setError(json?.error?.message ?? t("ws.cancelError"));
        if (response.status === 409) router.refresh();
        return;
      }
      const said = reason.trim();
      const id = cancelling.id;
      setRows((current) => current.map((row) => (row.id === id ? { ...row, status: json.data!.status, rejectReason: said ? `${SELLER_CANCEL_PREFIX}: ${said}` : `${SELLER_CANCEL_PREFIX}.` } : row)));
      setNotice(t("ws.cancelled", { ref: cancelling.ref }));
      setCancelling(null);
    } catch {
      setError(t("ws.offline"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {notice && <Notice tone="success">{notice}</Notice>}
      {payError && <Notice tone="error">{payError}</Notice>}
      <Card className="overflow-hidden">
        <div className="hidden border-b border-app-line px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-app-ink-soft lg:grid lg:grid-cols-[minmax(0,2.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_150px] lg:gap-4">
          <span>{t("ws.col.product")}</span>
          <span>{t("ws.col.quantity")}</span>
          <span>{t("ws.col.total")}</span>
          <span>{t("ws.col.placed")}</span>
          <span>{t("ws.col.status")}</span>
          <span className="sr-only">{t("ws.col.actions")}</span>
        </div>
        <ul className="m-0 list-none divide-y divide-app-line p-0">
          {rows.map((row) => {
            const stage = localWholesaleStage(t, sellerWholesaleStage(row.status, row.rejectReason));
            const canCancel = sellerCanCancelWholesale(row.status);
            return (
              <li key={row.id} data-order={row.ref} className="grid min-w-0 gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_150px] lg:items-center lg:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Thumb src={row.product.image} label={row.product.name} size={48} />
                  <div className="min-w-0">
                    <Link href={`/marketplace/product/${encodeURIComponent(row.product.id)}`} className="block truncate text-[14.5px] font-bold text-app-ink no-underline hover:underline">{row.product.name}</Link>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {row.supplier.slug ? <Link href={`/suppliers/${row.supplier.slug}`} className="text-app-ink-soft no-underline hover:underline">{row.supplier.name}</Link> : row.supplier.name}
                      <span className="font-mono text-[12px]"> · {row.ref}</span>
                    </div>
                  </div>
                </div>
                <dl className="m-0 grid grid-cols-3 gap-3 text-[13.5px] lg:contents">
                  <div className="min-w-0">
                    <dt className="text-[12px] text-app-ink-soft lg:sr-only">{t("ws.col.quantity")}</dt>
                    <dd className="m-0 font-semibold">{num(row.quantity)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[12px] text-app-ink-soft lg:sr-only">{t("ws.col.total")}</dt>
                    <dd className="m-0 font-semibold">{money(row.totalPrice, row.currency, locale)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[12px] text-app-ink-soft lg:sr-only">{t("ws.col.placed")}</dt>
                    <dd className="m-0">{row.placed}</dd>
                  </div>
                </dl>
                <div className="grid min-w-0 justify-items-start gap-1">
                  <Pill tone={stage.tone} dot>{stage.label}</Pill>
                  {row.sample && <Pill tone="warning">{t("sample.tag")}</Pill>}
                  {row.preorder && <Pill tone="warning">{row.preorder.ships ? `${t("pd.preorder")} · ${t("pd.preorderShips", { date: row.preorder.ships })}` : t("pd.preorder")}</Pill>}
                  {row.trackingCode && <span className="max-w-full truncate text-[12.5px] text-app-ink-soft">{t("pd.tracking", { code: row.trackingCode })}</span>}
                  {stage.note && <span className={cx("max-w-full break-words text-[12.5px]", stage.tone === "danger" ? "text-app-danger" : "text-app-ink-soft")}>{stage.note}</span>}
                  {row.paid && <Pill tone="success">{t("ws.paidInApp")}</Pill>}
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {row.canPay && (
                    <PillButton tone="accent" size="sm" busy={paying === row.id} disabled={paying !== null} onClick={() => void pay(row)} aria-label={t("ws.payLabel", { ref: row.ref })}>
                      {t("ws.pay", { total: money(row.payKobo ? row.payKobo / 100 : row.totalPrice, row.currency, locale) })}
                    </PillButton>
                  )}
                  {canCancel && (
                    <PillButton tone="white" size="sm" onClick={() => openCancel(row)} aria-label={t("ws.cancelLabel", { ref: row.ref })}>
                      {t("ws.cancelOrder")}
                    </PillButton>
                  )}
                  {row.canRate || row.rated ? <RateSupplier kind="wholesale_order" orderId={row.id} supplierName={row.supplier.name} rated={row.rated ?? null} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {cancelling && (
        <Modal title={t("ws.cancelTitle", { ref: cancelling.ref })} onClose={close}>
          <div className="grid gap-4">
            <p className="m-0 text-[14.5px] leading-[1.55]">
              {t("ws.cancelBody", { count: num(cancelling.quantity), product: cancelling.product.name, supplier: cancelling.supplier.name, total: money(cancelling.totalPrice, cancelling.currency, locale) })}
            </p>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="wholesale-cancel-reason">{t("ws.reason")} <span className="font-normal text-app-ink-soft">{t("pd.optional")}</span></FieldLabel>
              <textarea
                id="wholesale-cancel-reason"
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                className={textareaClass}
                placeholder={t("ws.reasonPh")}
              />
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap justify-end gap-2">
              <PillButton tone="white" size="md" onClick={close} disabled={busy}>{t("ws.keep")}</PillButton>
              <PillButton tone="ink" size="md" busy={busy} onClick={confirmCancel}>{t("ws.cancelOrder")}</PillButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
