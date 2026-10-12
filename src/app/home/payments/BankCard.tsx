"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill, type Tone } from "@/components/app-kit";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { BankLinkingModal } from "@/components/payments/BankLinkingModal";

export interface PayoutBankSummary {
  bankName: string;
  accountName: string;
  /** Last digits only; the full number is never sent to the page. */
  accountEnding: string;
  status: string | null;
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  failed: { tone: "danger", label: "Couldn't verify" },
  unconfigured: { tone: "warning", label: "Saved, not verified" },
};

export function BankCard({ bank }: { bank: PayoutBankSummary | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const status = bank ? STATUS[bank.status ?? ""] ?? { tone: "success" as Tone, label: "Connected" } : null;

  return (
    <Card className="p-5">
      <CardHead title="Your bank (where we send your money)" action={status ? <Pill tone={status.tone} dot>{status.label}</Pill> : undefined} />
      {bank ? (
        <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-app-canvas p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white"><Icon name="bank" size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold">{bank.bankName}</span>
            <span className="block truncate text-[13px] text-app-ink-soft">{bank.accountName}{bank.accountEnding ? ` · ending ${bank.accountEnding}` : ""}</span>
          </span>
        </div>
      ) : (
        <p className="mb-0 mt-3 text-[14px] leading-[1.5] text-app-ink-soft">Add the bank account where money from online orders should go. You can sell before adding one.</p>
      )}
      {bank?.status === "failed" && <p className="mb-0 mt-3 text-[13px] text-app-danger">Paystack couldn&apos;t confirm this account. Check the number and try again.</p>}
      <PillButton size="md" tone={bank ? "white" : "ink"} className="mt-4 w-full" onClick={() => setOpen(true)}>
        <Icon name={bank ? "edit" : "plus"} size={16} /> {bank ? "Change bank" : "Add payout bank"}
      </PillButton>
      <BankLinkingModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSuccess={() => router.refresh()}
        role="seller"
        initialBankName={bank?.bankName ?? ""}
        initialAccountName={bank?.accountName ?? ""}
      />
    </Card>
  );
}
