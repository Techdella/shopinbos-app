"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill, type Tone } from "@/components/app-kit";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { BankLinkingModal } from "@/components/payments/BankLinkingModal";
import { useT } from "@/components/i18n/I18nProvider";

export interface PayoutBankSummary {
  bankName: string;
  accountName: string;
  /** Last digits only; the full number is never sent to the page. */
  accountEnding: string;
  status: string | null;
}

const STATUS: Record<string, { tone: Tone; label: "bank.failed" | "bank.unconfigured" }> = {
  failed: { tone: "danger", label: "bank.failed" },
  unconfigured: { tone: "warning", label: "bank.unconfigured" },
};

export function BankCard({ bank }: { bank: PayoutBankSummary | null }) {
  const t = useT("payments", "common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const known = bank ? STATUS[bank.status ?? ""] : undefined;
  const status = bank ? (known ? { tone: known.tone, label: t(known.label) } : { tone: "success" as Tone, label: t("bank.connected") }) : null;

  return (
    <Card className="p-5">
      <CardHead title={t("bank.title")} action={status ? <Pill tone={status.tone} dot>{status.label}</Pill> : undefined} />
      {bank ? (
        <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-app-canvas p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white"><Icon name="bank" size={20} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-extrabold">{bank.bankName}</span>
            <span className="block truncate text-[13px] text-app-ink-soft">{bank.accountName}{bank.accountEnding ? ` · ${t("bank.ending", { digits: bank.accountEnding })}` : ""}</span>
          </span>
        </div>
      ) : (
        <p className="mb-0 mt-3 text-[14px] leading-[1.5] text-app-ink-soft">{t("bank.addHint")}</p>
      )}
      {bank?.status === "failed" && <p className="mb-0 mt-3 text-[13px] text-app-danger">{t("bank.failedNote")}</p>}
      <PillButton size="md" tone={bank ? "white" : "ink"} className="mt-4 w-full" onClick={() => setOpen(true)}>
        <Icon name={bank ? "edit" : "plus"} size={16} /> {bank ? t("bank.change") : t("bank.add")}
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
