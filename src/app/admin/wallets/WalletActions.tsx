"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveWalletBankAction, setWalletFrozenAction, setWalletKorapaySplitAccountAction } from "@/app/actions/wallet";
import { buttonClass, fieldClass } from "@/components/admin/AdminKit";

// Approve a bank account whose name isn't the verified owner's, and pause/resume a wallet (with a reason the owner sees).
export function WalletActions({ walletId, review, frozen, korapay }: { walletId: string; review: boolean; frozen: boolean; korapay: { allowed: boolean; reference: string | null } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const [reason, setReason] = useState("");
  const [splitAccount, setSplitAccount] = useState(korapay.reference ?? "");
  const [pending, startTransition] = useTransition();

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else setPausing(false);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {review ? <button type="button" className={buttonClass("ink", "sm")} disabled={pending} onClick={() => run(() => approveWalletBankAction(walletId))}>Approve account</button> : null}
        {frozen ? (
          <button type="button" className={buttonClass("white", "sm")} disabled={pending} onClick={() => run(() => setWalletFrozenAction(walletId, false))}>Resume</button>
        ) : (
          <button type="button" className={buttonClass("white", "sm")} disabled={pending} onClick={() => setPausing((open) => !open)}>Pause</button>
        )}
      </div>
      {pausing && !frozen ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => setWalletFrozenAction(walletId, true, reason.trim() || undefined));
          }}
        >
          <label className="sr-only" htmlFor={`pause-${walletId}`}>Why (the owner sees this)</label>
          <input id={`pause-${walletId}`} className={fieldClass} placeholder="Why (the owner sees this)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
          <button type="submit" className={buttonClass("ink", "sm")} disabled={pending}>Pause wallet</button>
        </form>
      ) : null}
      {korapay.allowed ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => setWalletKorapaySplitAccountAction(walletId, splitAccount));
          }}
        >
          <label className="sr-only" htmlFor={`korapay-${walletId}`}>Korapay split account</label>
          <input id={`korapay-${walletId}`} className={fieldClass} placeholder="Korapay split account (KPY-SPA-…)" value={splitAccount} onChange={(event) => setSplitAccount(event.target.value)} maxLength={60} />
          <button type="submit" className={buttonClass("white", "sm")} disabled={pending}>Save</button>
        </form>
      ) : null}
      {error ? <span className="text-[12.5px] text-app-danger">{error}</span> : null}
    </div>
  );
}
