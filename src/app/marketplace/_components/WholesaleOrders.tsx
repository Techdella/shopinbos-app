"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Pill, Thumb } from "@/components/app-kit";
import { FieldLabel, Notice, PillButton, cx } from "@/components/app-ui";
import { Modal } from "@/components/growth/Modal";
import { textareaClass } from "@/components/growth/kit";
import { sellerCanCancelWholesale, sellerWholesaleStage, SELLER_CANCEL_PREFIX } from "@/lib/supplier-orders/pure";

// The seller's wholesale orders (/marketplace/wholesale): every order they placed with a supplier, its stage, and
// "Cancel order" while the supplier hasn't started packing (PATCH /api/app/wholesale/[id] { action: "cancel" }).
// The server gives the reserved stock back once and tells the supplier; a repeat answers 409.

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
}

function money(amount: number, currency: string) {
  const value = Math.round(amount).toLocaleString("en-NG");
  return currency === "NGN" ? `₦${value}` : `${currency} ${value}`;
}

export function WholesaleOrders({ initial }: { initial: SellerWholesaleRow[] }) {
  const [rows, setRows] = useState(initial);
  const [cancelling, setCancelling] = useState<SellerWholesaleRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        setError(json?.error?.message ?? "We couldn't cancel this order. Try again.");
        return;
      }
      const said = reason.trim();
      const id = cancelling.id;
      setRows((current) => current.map((row) => (row.id === id ? { ...row, status: json.data!.status, rejectReason: said ? `${SELLER_CANCEL_PREFIX}: ${said}` : `${SELLER_CANCEL_PREFIX}.` } : row)));
      setNotice(`${cancelling.ref} is cancelled. The supplier has been told not to send it.`);
      setCancelling(null);
    } catch {
      setError("You seem to be offline. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {notice && <Notice tone="success">{notice}</Notice>}
      <Card className="overflow-hidden">
        <div className="hidden border-b border-app-line px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-app-ink-soft lg:grid lg:grid-cols-[minmax(0,2.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_150px] lg:gap-4">
          <span>Product and supplier</span>
          <span>Quantity</span>
          <span>Total</span>
          <span>Placed</span>
          <span>Status</span>
          <span className="sr-only">Actions</span>
        </div>
        <ul className="m-0 list-none divide-y divide-app-line p-0">
          {rows.map((row) => {
            const stage = sellerWholesaleStage(row.status, row.rejectReason);
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
                    <dt className="text-[12px] text-app-ink-soft lg:sr-only">Quantity</dt>
                    <dd className="m-0 font-semibold">{row.quantity.toLocaleString("en-NG")}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[12px] text-app-ink-soft lg:sr-only">Total</dt>
                    <dd className="m-0 font-semibold">{money(row.totalPrice, row.currency)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[12px] text-app-ink-soft lg:sr-only">Placed</dt>
                    <dd className="m-0">{row.placed}</dd>
                  </div>
                </dl>
                <div className="grid min-w-0 justify-items-start gap-1">
                  <Pill tone={stage.tone} dot>{stage.label}</Pill>
                  {row.trackingCode && <span className="max-w-full truncate text-[12.5px] text-app-ink-soft">Tracking {row.trackingCode}</span>}
                  {stage.note && <span className={cx("max-w-full break-words text-[12.5px]", stage.tone === "danger" ? "text-app-danger" : "text-app-ink-soft")}>{stage.note}</span>}
                </div>
                <div className="flex lg:justify-end">
                  {canCancel && (
                    <PillButton tone="white" size="sm" onClick={() => openCancel(row)} aria-label={`Cancel order ${row.ref}`}>
                      Cancel order
                    </PillButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {cancelling && (
        <Modal title={`Cancel ${cancelling.ref}?`} onClose={close}>
          <div className="grid gap-4">
            <p className="m-0 text-[14.5px] leading-[1.55]">
              {cancelling.quantity.toLocaleString("en-NG")} × {cancelling.product.name} from {cancelling.supplier.name} ({money(cancelling.totalPrice, cancelling.currency)}).
              We&apos;ll tell the supplier not to send it, and the stock goes back to them. This can&apos;t be undone.
            </p>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="wholesale-cancel-reason">Reason for the supplier <span className="font-normal text-app-ink-soft">(optional)</span></FieldLabel>
              <textarea
                id="wholesale-cancel-reason"
                value={reason}
                maxLength={500}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                className={textareaClass}
                placeholder="Found it closer to home, ordered too many…"
              />
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap justify-end gap-2">
              <PillButton tone="white" size="md" onClick={close} disabled={busy}>Keep order</PillButton>
              <PillButton tone="ink" size="md" busy={busy} onClick={confirmCancel}>Cancel order</PillButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
