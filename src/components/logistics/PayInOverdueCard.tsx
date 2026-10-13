"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { checkMyPayInsAgain } from "@/app/actions/logistics-payins";

/**
 * Calm amber card on Today and Cash when a pay-in is late (lib/logistics/payin-deadline.ts): how much and since
 * when, that pay-when-it-arrives jobs are paused until they pay, their own account number with Copy, and
 * "I've paid. Check again", which looks for the transfer straight away.
 */
export function PayInOverdueCard({
  title,
  body,
  account,
  className = "",
}: {
  title: string;
  body: string;
  account: { accountNumber: string; bankName: string; accountName: string } | null;
  className?: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function copy() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function checkAgain() {
    setMessage(null);
    start(async () => {
      const result = await checkMyPayInsAgain().catch(() => ({ ok: false as const, message: "That didn't go through. Check your connection and try again." }));
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="payin-overdue-title" className={`grid gap-4 rounded-[18px] bg-[#FDF0D5] p-5 text-[#3D2C00] ${className}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70 text-[#8A5A00]">
          <Icon name="clock" size={20} />
        </span>
        <div className="min-w-0">
          <h2 id="payin-overdue-title" className="m-0 text-[20px] font-extrabold leading-tight">{title}</h2>
          <p className="m-0 mt-1 text-[15px] leading-[1.5] text-[#5C4100]">{body}</p>
        </div>
      </div>
      {account ? (
        <div className="grid gap-2 rounded-[14px] bg-white/80 p-4">
          <span className="text-[15px] font-bold text-[#5C4100]">Pay into your account</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[26px] font-extrabold tracking-[0.06em] text-app-ink" aria-label={`Account number ${account.accountNumber.split("").join(" ")}`}>
              {account.accountNumber}
            </span>
            <PillButton tone={copied ? "white" : "ink"} size="sm" onClick={copy} className="min-h-[40px]" aria-live="polite">
              <Icon name="copy" size={15} />
              {copied ? "Copied" : "Copy"}
            </PillButton>
          </div>
          <span className="text-[15px] text-app-ink-soft">{account.bankName}{account.accountName ? ` · ${account.accountName}` : ""}</span>
        </div>
      ) : (
        <p className="m-0 rounded-[14px] bg-white/80 p-4 text-[15px] leading-[1.5] text-[#5C4100]">Pay in the usual way, then tell us how much you paid on the Cash page.</p>
      )}
      <PillButton tone="white" size="md" busy={pending} onClick={checkAgain} className="w-full">
        I&apos;ve paid. Check again
      </PillButton>
      {message && (
        <p role="status" className="m-0 text-[15px] font-bold leading-[1.5] text-[#5C4100]">{message}</p>
      )}
    </section>
  );
}
