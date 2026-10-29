"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Panel, PrimaryButton } from "@/components/storefront/shopper/ShopperShell";
import type { ShopperTheme } from "@/components/storefront/shopper/theme";
import { answerRefund, giveRefundAccountAction } from "./actions";

// The customer's side of a guided refund (shared/order-refunds.ts). Shopinbos never holds money, so the store sends
// its part of a refund from its own bank: the customer gives the account here (checked with the bank, the name shows),
// sees it being sent, and says whether it arrived.

export interface CustomerRefund {
  id: string;
  reasonText: string;
  amount: number;
  status: string;
  bankName: string | null;
  account: string;
  accountName: string | null;
}

const field = "min-h-12 w-full rounded-[12px] border px-3 text-[16px]";

export function RefundsPanel({ theme, orderId, refunds, banks, money }: { theme: ShopperTheme; orderId: string; refunds: CustomerRefund[]; banks: string[]; money: (amount: number) => string }) {
  if (!refunds.length) return null;
  return (
    <div id="refund" className="grid scroll-mt-4 gap-4">
      {refunds.map((refund) => <RefundCard key={refund.id} theme={theme} orderId={orderId} refund={refund} banks={banks} money={money} />)}
    </div>
  );
}

function RefundCard({ theme, orderId, refund, banks, money }: { theme: ShopperTheme; orderId: string; refund: CustomerRefund; banks: string[]; money: (amount: number) => string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(refund.status === "awaiting_account");
  const [bank, setBank] = useState(refund.bankName ?? "");
  const [account, setAccount] = useState("");
  const [missing, setMissing] = useState(false);
  const [why, setWhy] = useState("");
  const amount = money(refund.amount);

  function run(work: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const result = await work().catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
      if (!result.ok) return setError(result.error);
      setNote(result.message);
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <Panel theme={theme} className="grid gap-3 p-5" aria-labelledby={`refund-${refund.id}`}>
      <div>
        <h2 id={`refund-${refund.id}`} className="m-0 text-[18px] font-semibold" style={{ fontFamily: theme.heading }}>Your refund: {amount}</h2>
        <p className="m-0 mt-1 text-[14px]" style={{ color: theme.muted }}>{refund.reasonText}. The store sends it from its bank straight to yours.</p>
      </div>

      {editing ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => giveRefundAccountAction(orderId, refund.id, { bankName: bank, accountNumber: account }));
          }}
        >
          <label className="grid gap-1 text-[14px] font-semibold">
            Your bank
            <select required value={bank} onChange={(event) => setBank(event.target.value)} className={field} style={{ borderColor: theme.border, background: theme.surface }}>
              <option value="">Pick your bank</option>
              {banks.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-[14px] font-semibold">
            Account number
            <input required inputMode="numeric" autoComplete="off" maxLength={10} pattern="\d{10}" value={account} onChange={(event) => setAccount(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10 digits" className={`${field} font-mono tracking-[0.08em]`} style={{ borderColor: theme.border, background: theme.surface }} />
          </label>
          <p className="m-0 text-[12.5px]" style={{ color: theme.muted }}>We check it with your bank and show the account name before the store sends anything. Only the store sees the full number.</p>
          <PrimaryButton theme={theme} type="submit" disabled={pending || account.length !== 10 || !bank} className="w-full sm:w-auto">{pending ? "Checking…" : "Send my refund here"}</PrimaryButton>
        </form>
      ) : refund.status === "to_send" ? (
        <div className="grid gap-1 text-[14.5px]">
          <p className="m-0 flex items-center gap-1.5 font-semibold"><Icon name="clock" size={15} /> The store is sending it</p>
          <p className="m-0" style={{ color: theme.muted }}>To {refund.accountName ?? "your account"} · {refund.bankName} {refund.account}</p>
          <button type="button" className="justify-self-start text-[13.5px] underline" onClick={() => setEditing(true)}>Change account</button>
        </div>
      ) : refund.status === "sent" ? (
        missing ? (
          <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); run(() => answerRefund(orderId, refund.id, false, why)); }}>
            <label className="grid gap-1 text-[14px] font-semibold">
              What happened? (optional)
              <textarea value={why} onChange={(event) => setWhy(event.target.value)} maxLength={500} rows={2} className={`${field} py-2`} style={{ borderColor: theme.border, background: theme.surface }} />
            </label>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton theme={theme} type="submit" disabled={pending}>{pending ? "Sending…" : "Tell the store"}</PrimaryButton>
              <button type="button" className="min-h-12 px-3 text-[14px] underline" onClick={() => setMissing(false)}>Back</button>
            </div>
          </form>
        ) : (
          <div className="grid gap-2">
            <p className="m-0 text-[14.5px]">The store says it sent {amount} to {refund.accountName ?? refund.account}. Did it arrive?</p>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton theme={theme} type="button" disabled={pending} onClick={() => run(() => answerRefund(orderId, refund.id, true))}>Yes, I got it</PrimaryButton>
              <button type="button" className="min-h-12 rounded-full border px-5 text-[15px] font-semibold" style={{ borderColor: theme.border }} onClick={() => setMissing(true)}>Not yet</button>
            </div>
          </div>
        )
      ) : refund.status === "confirmed" ? (
        <p className="m-0 flex items-center gap-1.5 text-[14.5px] font-semibold" style={{ color: "#14532D" }}><Icon name="checkCircle" size={15} /> Refunded</p>
      ) : refund.status === "disputed" ? (
        <p className="m-0 text-[14.5px]">The store is checking and will get back to you.</p>
      ) : null}

      {note ? <p role="status" className="m-0 text-[13.5px] font-semibold" style={{ color: "#14532D" }}>{note}</p> : null}
      {error ? <p role="alert" className="m-0 text-[13.5px]" style={{ color: "#B42318" }}>{error}</p> : null}
    </Panel>
  );
}
