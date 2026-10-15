"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber } from "@shared/i18n";
import type { CreditPack } from "@shared/ai-credits";

// The AI credits button in the top bar and Rex Studio: the balance at a glance, today's free allowance, and a
// pack bought right here (Paystack brings the seller back to the same page). Anything that spends credits fires
// CREDITS_CHANGED_EVENT so the number stays true; "Buy credits" buttons fire OPEN_TOP_UP_EVENT to open it.

export const CREDITS_CHANGED_EVENT = "shopinbos:credits-changed";
export const OPEN_TOP_UP_EVENT = "shopinbos:open-top-up";

/** Tell every credits badge on the page to re-read the balance (after Rex or Peggy answered, an image, …). */
export function creditsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CREDITS_CHANGED_EVENT));
}

/** Opens the top-up panel when a badge is on the page; returns false when there is none (then link to /home/credits). */
export function openTopUp() {
  if (typeof document === "undefined" || !document.documentElement.dataset.creditsBadge) return false;
  window.dispatchEvent(new Event(OPEN_TOP_UP_EVENT));
  return true;
}

interface Summary {
  balance: number;
  autoTopUp: boolean;
  card: { brand: string | null; last4: string | null } | null;
  packs: CreditPack[];
  allowance: Array<{ kind: string; used: number; limit: number }>;
}

export function CreditsBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useT("nav");
  const locale = useLocale();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);
  const [autoOnBuy, setAutoOnBuy] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/app/credits", { credentials: "same-origin" });
      if (!response.ok) return;
      const json = (await response.json()) as { data?: Summary };
      if (json.data) setSummary(json.data);
    } catch {
      // The badge simply keeps its last number.
    }
  }, []);

  useEffect(() => {
    void load();
    const root = document.documentElement;
    root.dataset.creditsBadge = String(Number(root.dataset.creditsBadge ?? 0) + 1);
    const changed = () => void load();
    const openPanel = () => {
      setOpen(true);
      void load();
    };
    window.addEventListener(CREDITS_CHANGED_EVENT, changed);
    window.addEventListener(OPEN_TOP_UP_EVENT, openPanel);
    window.addEventListener("focus", changed);
    // Back from Paystack (?credits=paid|failed): say how it went.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("credits");
    if (result === "paid" || result === "failed" || result === "pending") {
      setOpen(true);
      setNote({ ok: result !== "failed", text: result === "paid" ? t("credits.added") : result === "pending" ? t("credits.pending") : params.get("error") ?? t("credits.notPaid") });
      params.delete("credits");
      params.delete("error");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    return () => {
      window.removeEventListener(CREDITS_CHANGED_EVENT, changed);
      window.removeEventListener(OPEN_TOP_UP_EVENT, openPanel);
      window.removeEventListener("focus", changed);
      const left = Number(root.dataset.creditsBadge ?? 1) - 1;
      if (left > 0) root.dataset.creditsBadge = String(left);
      else delete root.dataset.creditsBadge;
    };
  }, [load, t]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function buy(pack: CreditPack) {
    setBuying(pack.id);
    setNote(null);
    try {
      const response = await fetch("/api/app/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId: pack.id, autoTopUp: autoOnBuy, returnTo: `${window.location.pathname}${window.location.search}` }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { authorizationUrl?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.authorizationUrl) throw new Error(json?.error?.message ?? t("credits.failed"));
      window.location.assign(json.data.authorizationUrl);
    } catch (error) {
      setNote({ ok: false, text: error instanceof Error ? error.message : t("credits.failed") });
      setBuying(null);
    }
  }

  const balance = summary?.balance ?? null;
  const low = balance !== null && balance < 10;
  const naira = (value: number) => `₦${formatNumber(value, locale)}`;
  const today = (summary?.allowance ?? []).filter((row) => row.kind === "text" || row.kind === "image");

  return (
    <div ref={ref} className={cx("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={balance === null ? t("credits.title") : t("credits.aria", { count: balance })}
        onClick={() => {
          setOpen((value) => !value);
          void load();
        }}
        className={cx(
          "inline-flex h-[42px] items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-extrabold",
          low ? "border-app-accent bg-app-peach text-app-accent-ink" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
        )}
      >
        <Icon name="sparkle" size={15} />
        <span className="font-mono tabular-nums">{balance === null ? "…" : formatNumber(balance, locale)}</span>
        {compact ? null : <span className="hidden xl:inline">{t("credits.short")}</span>}
      </button>

      {open ? (
        <div role="dialog" aria-label={t("credits.title")} className="absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-24px))] rounded-[20px] border border-app-line bg-white p-4 text-left font-app text-app-ink shadow-[0_18px_50px_rgba(22,20,31,0.16)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[12px] font-bold uppercase tracking-[0.12em] text-app-ink-soft">{t("credits.title")}</p>
              <p className="m-0 mt-1 text-[30px] font-extrabold leading-none">{balance === null ? "…" : formatNumber(balance, locale)}</p>
            </div>
            {summary?.autoTopUp ? <span className="rounded-full bg-app-mint px-2.5 py-1 text-[11.5px] font-bold">{t("credits.autoOn")}</span> : null}
          </div>

          {today.length ? (
            <div className="mt-3 grid gap-1.5 rounded-[14px] bg-app-canvas p-3 text-[12.5px]">
              <p className="m-0 font-bold">{t("credits.freeToday")}</p>
              {today.map((row) => (
                <div key={row.kind}>
                  <div className="flex justify-between gap-2">
                    <span className="text-app-ink-soft">{row.kind === "image" ? t("credits.pictures") : t("credits.replies")}</span>
                    <span className={cx("font-mono tabular-nums", row.used >= row.limit && "font-bold text-app-danger")}>{row.used} / {row.limit}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white">
                    <div className="h-full rounded-full bg-app-ink" style={{ width: `${Math.min(100, Math.round((row.used / Math.max(1, row.limit)) * 100))}%` }} />
                  </div>
                </div>
              ))}
              <p className="m-0 text-[11.5px] leading-[1.4] text-app-ink-soft">{t("credits.how")}</p>
            </div>
          ) : null}

          {note ? <p role="status" className={cx("m-0 mt-3 rounded-[12px] px-3 py-2 text-[13px] font-bold", note.ok ? "bg-app-mint" : "bg-app-danger-tint text-app-danger")}>{note.text}</p> : null}

          <p className="m-0 mt-3 text-[13px] font-bold">{t("credits.topUp")}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(summary?.packs ?? []).map((pack) => (
              <button
                key={pack.id}
                type="button"
                disabled={buying !== null}
                onClick={() => void buy(pack)}
                className={cx("grid gap-0.5 rounded-[14px] border px-2 py-2.5 text-center disabled:opacity-60", pack.badge ? "border-app-ink" : "border-app-line hover:border-app-line-strong")}
              >
                {buying === pack.id ? <Spinner className="mx-auto h-4 w-4" /> : <span className="text-[17px] font-extrabold leading-none">{formatNumber(pack.credits, locale)}</span>}
                <span className="text-[11.5px] text-app-ink-soft">{naira(pack.naira)}</span>
              </button>
            ))}
          </div>
          {summary?.autoTopUp ? null : (
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-[12.5px] leading-[1.4]">
              <input type="checkbox" checked={autoOnBuy} onChange={(event) => setAutoOnBuy(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#16141F]" />
              <span>{t("credits.autoOnBuy")}</span>
            </label>
          )}
          <Link href="/home/credits" onClick={() => setOpen(false)} className="mt-3 inline-flex text-[13px] font-bold text-app-ink underline underline-offset-2">
            {t("credits.manage")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
