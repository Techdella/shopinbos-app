"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";

// The wallet's own account number, shown like a bank card: the number in easy-to-read groups, the bank and the
// account name, and Copy. WalletAccountCard is the full card on the wallet page; WalletMini is the one-line version
// for the sidebar and the home screen (GET /api/app/wallet?summary=1).

/** 9818722144 → "981 872 2144", the way people read a number out. */
export function groupedAccountNumber(number: string) {
  return number.length === 10 ? `${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}` : number;
}

function CopyButton({ value, tone = "dark", className }: { value: string; tone?: "dark" | "light"; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => null);
      }}
      className={cx(
        "inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold",
        tone === "dark" ? "bg-white/12 text-white hover:bg-white/20" : "border border-app-line bg-white text-app-ink hover:bg-app-canvas",
        className,
      )}
      aria-label={copied ? "Account number copied" : "Copy account number"}
    >
      <Icon name={copied ? "check" : "copy"} size={13} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function WalletAccountCard({ account, aside, footer, goesTo }: { account: { number: string; bank: string; name: string }; aside?: ReactNode; footer?: ReactNode; goesTo?: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-app-ink p-5 text-white">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/[0.06]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-10 h-44 w-44 rounded-full bg-white/[0.04]" />
      <div className="relative flex items-center gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/60">Wallet account</span>
        <span className="rounded-full bg-white/12 px-2.5 py-0.5 text-[11.5px] font-bold">{account.bank || "Bank"}</span>
        <span className="ml-auto">{aside}</span>
      </div>
      <div className="relative mt-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[28px] font-bold leading-none tracking-[0.06em] sm:text-[32px]">{groupedAccountNumber(account.number)}</span>
        <CopyButton value={account.number} />
      </div>
      <div className="relative mt-4 grid gap-0.5">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/60">Account name</span>
        <span className="text-[14.5px] font-bold">{account.name}</span>
      </div>
      <p className="relative mb-0 mt-3 text-[12.5px] leading-[1.5] text-white/70">
        {goesTo ? `Transfer from any bank app. It goes straight to your bank, ${goesTo}, usually the next working day.` : "Transfer from any bank app. It lands in your wallet balance within a minute or two."}
      </p>
      {footer ? <div className="relative mt-3">{footer}</div> : null}
    </div>
  );
}

type Summary = { active?: boolean; balanceNaira: number; account: { number: string; bank: string; name: string } | null; href: string } | null;

const naira = (value: number) => `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** The wallet in a line: balance, and the account number with Copy. Shows nothing until there's a wallet to show. */
export function WalletMini({ variant }: { variant: "sidebar" | "home" }) {
  const [summary, setSummary] = useState<Summary>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/app/wallet?summary=1", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { data?: Summary } | null) => {
        if (live && json?.data) setSummary(json.data);
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);
  if (!summary) return null;

  if (variant === "sidebar") {
    return (
      <div className="mx-0.5 mt-3 rounded-[14px] bg-app-ink p-3 text-white">
        <Link href={summary.href} className="flex items-center justify-between gap-2 text-white no-underline">
          <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-white/60">Wallet</span>
          <span className="text-[13.5px] font-extrabold">{naira(summary.balanceNaira)}</span>
        </Link>
        {summary.account ? (
          <span className="mt-1.5 flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block font-mono text-[14px] font-bold tracking-[0.04em]">{groupedAccountNumber(summary.account.number)}</span>
              <span className="block truncate text-[11px] text-white/60">{summary.account.bank}</span>
            </span>
            <CopyButton value={summary.account.number} className="min-h-[28px] px-2.5 text-[11.5px]" />
          </span>
        ) : (
          <Link href={summary.href} className="mt-1 block text-[11.5px] text-white/60 no-underline">Top up and spend</Link>
        )}
        {summary.active === false ? <Link href={summary.href} className="mt-1.5 block text-[11px] font-bold text-[#FFC48A] no-underline">Activates when you&apos;re verified</Link> : null}
      </div>
    );
  }

  return (
    <div className="rounded-[22px] bg-app-ink p-5 text-white">
      <Link href={summary.href} className="block text-white no-underline">
        <span className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/60">Shopinbos Wallet</span>
          <Icon name="chevRight" size={16} className="text-white/60" />
        </span>
        <span className="mt-1 block text-[28px] font-extrabold leading-tight tracking-[-0.02em]">{naira(summary.balanceNaira)}</span>
      </Link>
      {summary.account ? (
        <span className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-white/[0.08] px-3.5 py-2.5">
          <span className="min-w-0">
            <span className="block font-mono text-[17px] font-bold tracking-[0.05em]">{groupedAccountNumber(summary.account.number)}</span>
            <span className="block truncate text-[12px] text-white/65">{summary.account.bank} · {summary.account.name}</span>
          </span>
          <CopyButton value={summary.account.number} />
        </span>
      ) : (
        <span className="mt-2 block text-[13px] text-white/70">Top up by transfer or card and spend on AI credits.</span>
      )}
    </div>
  );
}
