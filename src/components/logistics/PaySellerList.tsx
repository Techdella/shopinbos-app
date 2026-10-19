"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmSellerPayInAction, startSellerPayInAction } from "@/app/actions/cod-payins";

// Cash collected for each seller, paid straight to that seller: through Paystack (split to the seller's own bank)
// when their Shopinbos Wallet is set up, else handed over and confirmed by the seller in the app.

export interface SellerCashRow {
  sellerId: string;
  sellerName: string;
  amount: number;
  jobs: number;
  payable: boolean;
}

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export function PaySellerList({ rows }: { rows: SellerCashRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  function pay(row: SellerCashRow) {
    setMessage(null);
    setBusy(row.sellerId);
    startTransition(async () => {
      const started = await startSellerPayInAction(row.sellerId);
      if (!started.ok) {
        setBusy(null);
        setMessage({ tone: "error", text: started.error });
        return;
      }
      const { default: PaystackPop } = await import("@paystack/inline-js");
      new PaystackPop().resumeTransaction(started.accessCode, {
        onSuccess: (transaction) => {
          void confirmSellerPayInAction(transaction.reference ?? started.reference).then((result) => {
            setBusy(null);
            setMessage(result.ok
              ? { tone: "success", text: `Paid ${row.sellerName}. ${result.settled} cash job${result.settled === 1 ? "" : "s"} settled.` }
              : { tone: "error", text: "Paystack took the payment; it shows here once Paystack confirms it. Refresh in a minute." });
            router.refresh();
          });
        },
        onCancel: () => setBusy(null),
        onError: () => {
          setBusy(null);
          setMessage({ tone: "error", text: "Paystack couldn't open. Check your connection and try again." });
        },
      });
    });
  }

  if (!rows.length) return <p className="m-0 text-[15px] text-app-ink-soft">No cash is waiting to go to a seller.</p>;
  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((row) => (
          <li key={row.sellerId} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-app-line px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-extrabold">{row.sellerName}</div>
              <div className="text-[13.5px] text-app-ink-soft">{naira(row.amount)} · {row.jobs} job{row.jobs === 1 ? "" : "s"}</div>
            </div>
            {row.payable ? (
              <button type="button" onClick={() => pay(row)} disabled={busy !== null} className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13.5px] font-extrabold text-white disabled:opacity-55">
                {busy === row.sellerId ? "Opening…" : `Pay ${naira(row.amount)}`}
              </button>
            ) : (
              <span className="max-w-[220px] text-[13px] leading-[1.4] text-app-ink-soft">Hand the cash to {row.sellerName}. They confirm it in Shopinbos.</span>
            )}
          </li>
        ))}
      </ul>
      {message ? <p role="status" className={`m-0 text-[14px] ${message.tone === "error" ? "text-app-danger" : "font-bold text-app-forest"}`}>{message.text}</p> : null}
    </div>
  );
}
