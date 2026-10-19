"use client";

import { useState, useTransition, useEffect } from "react";
import { linkBankAccount } from "@/app/actions/payments";
import { checkWalletAccountAction, walletBankNamesAction } from "@/app/actions/wallet";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

interface BankLinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: "seller" | "supplier" | "logistics_partner";
  onSuccess?: () => void;
  initialBankName?: string;
  initialAccountNumber?: string;
  /** Kept for older callers: the name now always comes from the bank's own records. */
  initialAccountName?: string;
}

// The bank picker shows this short list until the full list (every bank and fintech payments settle to) arrives.
const COMMON_BANKS = [
  "Access Bank",
  "Citibank Nigeria",
  "Ecobank Nigeria",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank (FCMB)",
  "Guaranty Trust Bank (GTBank)",
  "Heritage Bank",
  "Keystone Bank",
  "Kuda Microfinance Bank",
  "Moniepoint MFB",
  "Opay",
  "PalmPay",
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

type Lookup = { key: string; status: "resolved" | "not_found" | "unavailable"; name: string | null };

// "Add your bank" for sellers (Money page), suppliers and delivery partners (payouts). The account is looked up as
// soon as the 10 digits are in, so the person confirms the name the bank has instead of typing one; saving also sets
// up their Shopinbos Wallet, which is what lets customers pay them by card.
export function BankLinkingModal({
  isOpen,
  onClose,
  role,
  onSuccess,
  initialBankName = "",
  initialAccountNumber = "",
}: BankLinkingModalProps) {
  const t = useT("payments", "common");
  const [isPending, startTransition] = useTransition();
  const [banks, setBanks] = useState<string[]>(COMMON_BANKS);
  const [bankName, setBankName] = useState(initialBankName);
  const [accountNumber, setAccountNumber] = useState(initialAccountNumber);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lookupKey = bankName && accountNumber.length === 10 ? `${bankName}:${accountNumber}` : "";

  useEffect(() => {
    if (isOpen) {
      setBankName(initialBankName);
      const digits = initialAccountNumber.replace(/\D/g, "");
      setAccountNumber(digits.length === 10 ? digits : "");
      setLookup(null);
      setError(null);
    }
  }, [isOpen, initialBankName, initialAccountNumber]);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    void walletBankNamesAction().then((names) => {
      if (alive && names.length) setBanks(names);
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!lookupKey) return;
    let alive = true;
    void checkWalletAccountAction({ bankName, accountNumber }).then((result) => {
      if (alive) setLookup({ key: lookupKey, status: result.status, name: result.status === "resolved" ? result.accountName : null });
    });
    return () => {
      alive = false;
    };
  }, [lookupKey, bankName, accountNumber]);

  if (!isOpen) return null;
  const shown = lookup && lookup.key === lookupKey ? lookup : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!bankName) {
      setError(t("bm.selectBank"));
      return;
    }
    if (accountNumber.length !== 10) {
      setError(t("bm.tenDigits"));
      return;
    }
    if (!shown?.name) {
      setError(shown?.status === "not_found" ? t("bm.notFound") : t("bm.unavailable"));
      return;
    }
    const accountName = shown.name;

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
              {(bankName && !banks.includes(bankName) ? [bankName, ...banks] : banks).map((bank) => (
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

          {/* Whose account it is, from the bank */}
          {lookupKey && !shown ? <p className="m-0 text-[13px] text-[var(--ink-600)]" aria-live="polite">{t("bm.lookingUp")}</p> : null}
          {shown?.name ? (
            <div className="rounded-lg border border-[var(--ink-100)] bg-[var(--teal-50)] px-4 py-3" aria-live="polite">
              <div className="text-[12px] text-[var(--ink-600)]">{t("bm.accountName")}</div>
              <div className="text-[15px] font-semibold text-[var(--ink-900)]">{shown.name}</div>
            </div>
          ) : null}
          {shown && !shown.name ? (
            <p className="m-0 text-[12.5px] text-[var(--color-coral)]" aria-live="polite">{shown.status === "not_found" ? t("bm.notFound") : t("bm.unavailable")}</p>
          ) : null}

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
              disabled={isPending || !shown?.name} 
              className="dbtn dBtn-mint dBtn-sm flex items-center gap-1.5"
            >
              {isPending ? t("bm.saving") : <>{shown?.name ? t("bm.confirm") : t("bm.save")} <Icon name="check" size={12} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
