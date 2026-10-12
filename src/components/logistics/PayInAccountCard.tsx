"use client";

import { useState } from "react";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";

/**
 * The delivery company's own pay-in account (spec 8A: "Paying in cash shows their own account number with a Copy
 * button; payments match automatically"). Account number big, Copy next to it, then the bank and account name.
 */
export function PayInAccountCard({ accountNumber, bankName, accountName }: { accountNumber: string; bankName: string; accountName: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-[18px] border border-app-line bg-white p-4">
      <div className="text-[15px] font-bold text-app-ink-soft">Your pay-in account</div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[28px] font-extrabold tracking-[0.06em] text-app-ink" aria-label={`Account number ${accountNumber.split("").join(" ")}`}>
          {accountNumber}
        </span>
        <PillButton tone={copied ? "white" : "ink"} size="sm" onClick={copy} className="min-h-[40px]" aria-live="polite">
          <Icon name="copy" size={15} />
          {copied ? "Copied" : "Copy"}
        </PillButton>
      </div>
      <div className="grid gap-0.5 text-[15px]">
        <span className="font-bold text-app-ink">{bankName}</span>
        <span className="text-app-ink-soft">{accountName}</span>
      </div>
      <p className="m-0 text-[15px] leading-[1.5] text-app-ink-soft">We match your payment automatically. It shows here within a few minutes.</p>
    </div>
  );
}
