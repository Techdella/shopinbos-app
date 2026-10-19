"use client";

import { useEffect, useState } from "react";
import { checkKorapayPayment } from "@/app/actions/payments";

// Korapay's payment page for an order, shown in a frame over the store's checkout (the charge and its split were
// started on the server). While it's open the page asks the server every few seconds whether Korapay has the
// money; the server checks with Korapay itself. If the frame can't load, the shopper opens the page directly
// (it comes back to the order page).

const POLL_MS = 4000;

export function KorapayFrame({ orderId, checkoutUrl, onPaid, onClose }: { orderId: string; checkoutUrl: string; onPaid: () => void; onClose: () => void }) {
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped) return;
      const result = await checkKorapayPayment(orderId).catch(() => ({ paid: false }));
      if (result.paid && !stopped) {
        stopped = true;
        onPaid();
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [orderId, onPaid]);

  async function close() {
    setChecking(true);
    const result = await checkKorapayPayment(orderId).catch(() => ({ paid: false }));
    setChecking(false);
    if (result.paid) onPaid();
    else onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Pay with Korapay" className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-3">
      <div className="flex h-[min(680px,92vh)] w-full max-w-[460px] flex-col overflow-hidden rounded-[18px] bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-2.5 text-[14px]">
          <span className="font-semibold">Pay securely with Korapay</span>
          <button type="button" onClick={() => void close()} className="rounded-full px-3 py-1.5 font-semibold hover:bg-black/5" disabled={checking}>
            {checking ? "Checking…" : "Close"}
          </button>
        </div>
        <iframe src={checkoutUrl} title="Korapay checkout" className="min-h-0 w-full flex-1 border-0" allow="payment" referrerPolicy="origin" />
        <p className="m-0 border-t border-black/10 px-4 py-2 text-center text-[12.5px] text-black/60">
          Page not loading? <a href={checkoutUrl} className="font-semibold underline">Open Korapay</a> instead.
        </p>
      </div>
    </div>
  );
}
