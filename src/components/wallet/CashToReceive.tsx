"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmCashReceivedAction } from "@/app/actions/cod-payins";

// Cash on delivery a delivery partner's riders collected for the seller and haven't paid over in the app. The
// partner can pay it in the app (split straight to the seller's bank), or hand it over: then the seller confirms here.

export interface CashToReceiveRow {
  partnerId: string;
  partnerName: string;
  amount: number;
  jobs: number;
}

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export function CashToReceive({ rows }: { rows: CashToReceiveRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!rows.length) return null;
  return (
    <section className="grid gap-3 rounded-[22px] border border-app-line bg-white p-5">
      <div>
        <h2 className="m-0 text-[17px] font-extrabold">Cash on delivery to come to you</h2>
        <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">Riders collected this for your orders. Their delivery partner pays it to you; if they hand it over or transfer it to you directly, confirm it here.</p>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((row) => (
          <li key={row.partnerId} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-app-line px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-extrabold">{row.partnerName}</div>
              <div className="text-[13.5px] text-app-ink-soft">{naira(row.amount)} · {row.jobs} job{row.jobs === 1 ? "" : "s"}</div>
            </div>
            <button
              type="button"
              disabled={pending}
              className="inline-flex min-h-[40px] items-center rounded-full border border-app-line bg-white px-4 text-[13.5px] font-extrabold disabled:opacity-55"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await confirmCashReceivedAction(row.partnerId);
                  if (!result.ok) setError(result.error);
                  router.refresh();
                });
              }}
            >
              I&apos;ve received {naira(row.amount)}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="m-0 text-[13.5px] text-app-danger">{error}</p> : null}
    </section>
  );
}
