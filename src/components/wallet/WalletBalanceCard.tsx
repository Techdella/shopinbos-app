"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { BALANCE_LIMITS } from "@/lib/wallet/balance-rules";
import { WalletAccountPanel, type WalletAccountView } from "./WalletAccountPanel";

// The prepaid wallet (sellers, suppliers, delivery partners): balance, top up (card, or a transfer to their own
// account number), withdraw to their bank, and what moved. Sales don't come here: they go straight to the bank.

type View = WalletAccountView & {
  /** False for a supplier or delivery partner whose business isn't verified yet. Older servers don't send it. */
  open?: boolean;
  ready: boolean;
  balanceNaira: number;
  canWithdraw: boolean;
  bank: string | null;
  transactions: Array<{ id: string; kind: string; naira: number; status: string; description: string; error: string | null; at: string }>;
};

const naira = (value: number) => `₦${value.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fieldClass = "min-h-[46px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[15px] outline-none focus:border-app-ink";

export function WalletBalanceCard({ returnTo, notice }: { returnTo: string; notice?: string | null }) {
  const [view, setView] = useState<View | null>(null);
  const [mode, setMode] = useState<"topup" | "withdraw" | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(notice === "done" ? { tone: "ok", text: "Top-up received. Your balance is updated." } : notice === "failed" ? { tone: "error", text: "That top-up didn't go through. Nothing was taken." } : notice === "pending" ? { tone: "ok", text: "Top-up is processing. It shows here as soon as the bank confirms it." } : null);
  const [pending, start] = useTransition();

  const load = useCallback(async () => {
    const response = await fetch("/api/app/wallet", { cache: "no-store" }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: View } | null;
    if (json?.data) setView(json.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const submit = () =>
    start(async () => {
      setMessage(null);
      const value = Number(amount.replace(/[^\d]/g, ""));
      const response = await fetch(mode === "topup" ? "/api/app/wallet/topup" : "/api/app/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naira: value, returnTo }),
      }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { data?: { authorizationUrl?: string; status?: string }; error?: { message?: string } } | null;
      if (!response?.ok) return setMessage({ tone: "error", text: json?.error?.message ?? "That didn't work. Try again." });
      if (mode === "topup" && json?.data?.authorizationUrl) {
        window.location.assign(json.data.authorizationUrl);
        return;
      }
      setMessage({ tone: "ok", text: json?.data?.status === "done" ? "Sent to your bank." : "On its way to your bank. It usually arrives within minutes." });
      setMode(null);
      setAmount("");
      void load();
    });

  if (!view) return <section aria-busy="true" className="mb-5 h-[150px] animate-pulse rounded-[22px] border border-app-line bg-white" />;
  if (view.open === false) {
    return (
      <section aria-labelledby="wallet-balance" className="mb-5 rounded-[22px] border border-app-line bg-white p-5">
        <h2 id="wallet-balance" className="m-0 text-[13px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">Wallet balance</h2>
        <p className="mb-0 mt-2 text-[14px] leading-[1.5]">
          Your wallet and its own account number open once your business is verified. <a href={returnTo.startsWith("/logistics") ? "/logistics/verification" : "/supplier/verification"} className="font-bold underline underline-offset-4">Finish your verification</a>
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="wallet-balance" className="mb-5 rounded-[22px] border border-app-line bg-white p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-[220px]">
          <h2 id="wallet-balance" className="m-0 text-[13px] font-extrabold uppercase tracking-[0.08em] text-app-ink-soft">Wallet balance</h2>
          <div className="mt-1 text-[34px] font-extrabold leading-none tracking-[-0.03em]">{naira(view.balanceNaira)}</div>
          <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">Top up by transfer or card, spend it on AI credits and other Shopinbos services, or withdraw it to your main bank account. Sales still go straight to your bank.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!view.ready} onClick={() => { setMode(mode === "topup" ? null : "topup"); setMessage(null); }} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-50">
            <Icon name="plus" size={15} /> Top up
          </button>
          <button type="button" disabled={!view.ready || !view.canWithdraw || view.balanceNaira < BALANCE_LIMITS.withdrawMin} onClick={() => { setMode(mode === "withdraw" ? null : "withdraw"); setMessage(null); }} className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold text-app-ink disabled:opacity-50">
            <Icon name="arrow" size={15} /> Withdraw
          </button>
        </div>
      </div>

      <WalletAccountPanel view={view} onUpdated={setView} />

      {mode && (
        <form
          className="mt-4 grid gap-3 rounded-[18px] bg-app-canvas p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="grid gap-1.5 text-[13.5px] font-bold">
            {mode === "topup" ? "Amount to add by card" : `Amount to send to ${view.bank ?? "your bank"}`}
            <input inputMode="numeric" className={fieldClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === "topup" ? `₦${BALANCE_LIMITS.topUpMin.toLocaleString("en-NG")} or more` : `₦${BALANCE_LIMITS.withdrawMin.toLocaleString("en-NG")} or more`} required />
          </label>
          <div className="flex flex-wrap gap-2">
            {(mode === "topup" ? [2000, 5000, 10000] : [view.balanceNaira]).filter((v) => v > 0).map((preset) => (
              <button key={preset} type="button" onClick={() => setAmount(String(Math.floor(preset)))} className="min-h-[34px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold">
                {mode === "withdraw" ? `All (${naira(Math.floor(preset))})` : naira(preset)}
              </button>
            ))}
          </div>
          <button type="submit" disabled={pending} className="inline-flex min-h-[46px] w-fit items-center rounded-full bg-app-accent px-5 text-[14px] font-extrabold text-white disabled:opacity-60">
            {pending ? "One moment…" : mode === "topup" ? "Continue to pay" : "Withdraw"}
          </button>
        </form>
      )}
      {!view.canWithdraw && view.balanceNaira > 0 && <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">To withdraw, add and check your bank account below first.</p>}
      {!view.ready && <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">Top-ups open shortly.</p>}
      {message && <p role="status" className={cx("mb-0 mt-3 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold", message.tone === "ok" ? "bg-app-success-tint text-app-success" : "bg-app-danger-tint text-app-danger")}>{message.text}</p>}

      {view.transactions.length > 0 && (
        <ul className="m-0 mt-4 list-none divide-y divide-app-line border-t border-app-line p-0">
          {view.transactions.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5 text-[13.5px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{t.description}</span>
                <span className="block text-[12px] text-app-ink-soft">
                  {new Date(t.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {t.status === "pending" ? " · on its way" : t.status === "failed" ? ` · didn't go through${t.error ? `: ${t.error}` : ""}` : ""}
                </span>
              </span>
              <span className={cx("shrink-0 font-extrabold", t.naira > 0 ? "text-app-success" : "text-app-ink")}>{t.naira > 0 ? "+" : "−"}{naira(Math.abs(t.naira))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
