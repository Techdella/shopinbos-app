"use client";

import { useState, useTransition, useEffect } from "react";
import { linkBankAccount } from "@/app/actions/payments";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

interface BankLinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: "seller" | "supplier" | "logistics_partner";
  onSuccess?: () => void;
  initialBankName?: string;
  initialAccountNumber?: string;
  initialAccountName?: string;
}

const NIGERIAN_BANKS = [
  "Access Bank",
  "Citibank Nigeria",
  "Ecobank Nigeria",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank (FCMB)",
  "Guaranty Trust Bank (GTBank)",
  "Heritage Bank",
  "Keystone Bank",
  "Moniepoint MFB",
  "Opay",
  "Polaris Bank",
  "Providus Bank",
  "Stanbic IBTC Bank",
  "Standard Chartered Bank",
  "Sterling Bank",
  "Union Bank of Nigeria",
  "United Bank for Africa (UBA)",
  "Unity Bank",
  "Wema Bank",
  "Zenith Bank",
];


export function BankLinkingModal({
  isOpen,
  onClose,
  role,
  onSuccess,
  initialBankName = "",
  initialAccountNumber = "",
  initialAccountName = "",
}: BankLinkingModalProps) {
  const t = useT("payments", "common");
  const [isPending, startTransition] = useTransition();
  const [bankName, setBankName] = useState(initialBankName);
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber);
  const [accountName, setAccountName] = useState(initialAccountName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBankName(initialBankName);
      const digits = initialAccountNumber.replace(/\D/g, "");
      setAccountNumber(digits.length === 10 ? digits : "");
      setAccountName(initialAccountName);
      setError(null);
    }
  }, [isOpen, initialBankName, initialAccountNumber, initialAccountName]);

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!bankName) {
      setError(t("bm.selectBank"));
      return;
    }
    if (!accountNumber || accountNumber.length !== 10) {
      setError(t("bm.tenDigits"));
      return;
    }
    if (!accountName.trim()) {
      setError(t("bm.enterName"));
      return;
    }

    startTransition(async () => {
      const result = await linkBankAccount(role, bankName, accountNumber, accountName);
      if (result.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(result.error ?? t("bm.failed"));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-[var(--ink-100)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--ink-100)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--teal-50)] text-[var(--teal-700)]">
              <Icon name="bank" size={16} />
            </span>
            <h3 className="m-0 text-[16px] font-semibold text-[var(--ink-900)]">{t("bm.title")}</h3>
          </div>
          <button 
            type="button" 
            aria-label={t("bm.close")}
            onClick={onClose} 
            className="text-[var(--ink-400)] hover:text-[var(--ink-700)] transition"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="text-[13px] leading-5 text-[var(--ink-600)]">
            {t("bm.intro")}
          </div>

          {/* Bank Select */}
          <div className="field">
            <label className="label">{t("bm.bankName")}</label>
            <select
              className="inp w-full"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              disabled={isPending}
            >
              <option value="">{t("bm.chooseBank")}</option>
              {NIGERIAN_BANKS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </div>

          {/* Account Number */}
          <div className="field">
            <label className="label">{t("bm.accountNumber")}</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              className="inp w-full"
              placeholder={t("bm.accountNumberPlaceholder")}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              disabled={isPending}
            />
          </div>

          {/* Account Name */}
          <div className="field">
            <label className="label">{t("bm.accountName")}</label>
            <input
              type="text"
              className="inp w-full"
              placeholder={t("bm.accountNamePlaceholder")}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 text-[12.5px] leading-5 text-[var(--color-coral)] bg-[rgb(232_106_79_/_0.08)] border border-[rgb(232_106_79_/_0.2)] rounded-lg">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-[var(--ink-100)] pt-4">
            <button 
              type="button" 
              onClick={onClose} 
              disabled={isPending} 
              className="dbtn dBtn-ghost dBtn-sm"
            >
              {t("cancel")}
            </button>
            <button 
              type="submit" 
              disabled={isPending} 
              className="dbtn dBtn-mint dBtn-sm flex items-center gap-1.5"
            >
              {isPending ? t("bm.saving") : <>{t("bm.save")} <Icon name="check" size={12} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
