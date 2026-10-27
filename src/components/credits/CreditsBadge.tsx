"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber } from "@shared/i18n";
import type { CreditPack } from "@shared/ai-credits";
import { friendlyError } from "@/lib/errors/report-client";

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

export function CreditsBadge({
  className,
  compact = false,
  manageHref = "/home/credits",
  headless = false,
  onClose,
}: {
  className?: string;
  compact?: boolean;
  manageHref?: string;
  /** Just the buy popup, already open, with no badge button (for pages without a badge). */
  headless?: boolean;
  onClose?: () => void;
}) {
  const t = useT("nav");
  const locale = useLocale();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [open, setOpenState] = useState(headless);
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (!next) onClose?.();
    },
    [onClose],
  );
  const [autoOnBuy, setAutoOnBuy] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/app/credits", {
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const json = (await response.json()) as { data?: Summary };
      if (json.data) setSummary(json.data);
    } catch {
      // The badge simply keeps its last number.
    }
  }, []);

  useEffect(() => {
    void load();
    if (headless) return;
    const root = document.documentElement;
    root.dataset.creditsBadge = String(Number(root.dataset.creditsBadge ?? 0) + 1);
    const changed = () => void load();
    const openPanel = () => {
      setOpenState(true);
      void load();
    };
    window.addEventListener(CREDITS_CHANGED_EVENT, changed);
    window.addEventListener(OPEN_TOP_UP_EVENT, openPanel);
    window.addEventListener("focus", changed);
    // Back from Paystack (?credits=paid|failed): say how it went.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("credits");
    if (result === "paid" || result === "failed" || result === "pending") {
      setOpenState(true);
      setNote({
        ok: result !== "failed",
        text: result === "paid" ? t("credits.added") : result === "pending" ? t("credits.pending") : (params.get("error") ?? t("credits.notPaid")),
      });
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
  }, [load, t, headless]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, setOpen]);

  async function buy(pack: CreditPack) {
    setBuying(pack.id);
    setNote(null);
    try {
      const response = await fetch("/api/app/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId: pack.id,
          autoTopUp: autoOnBuy,
          returnTo: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { authorizationUrl?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !json?.data?.authorizationUrl) throw new Error(json?.error?.message ?? t("credits.failed"));
      window.location.assign(json.data.authorizationUrl);
    } catch (error) {
      setNote({
        ok: false,
        text: error instanceof Error ? friendlyError(error) : t("credits.failed"),
      });
      setBuying(null);
    }
  }

  const balance = summary?.balance ?? null;
  const low = balance !== null && balance < 10;
  const naira = (value: number) => `₦${formatNumber(value, locale)}`;
  const today = (summary?.allowance ?? []).filter((row) => row.kind === "text" || row.kind === "image");

  const modal = open ? (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(22,20,31,0.45)] p-0 font-app text-app-ink sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-modal-title"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] bg-white p-5 text-left shadow-[0_24px_70px_rgba(22,20,31,0.25)] outline-none sm:max-w-[460px] sm:rounded-[24px] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="credits-modal-title" className="m-0 text-[19px] font-extrabold">
              {t("credits.buyTitle")}
            </h2>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">
              {t("credits.youHave", { count: balance ?? 0 })}
              {summary?.autoTopUp ? ` · ${t("credits.autoOn")}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("credits.close")} className="grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-app-canvas">
            <Icon name="x" size={16} />
          </button>
        </div>

        {note ? (
          <p role="status" className={cx("m-0 mt-4 rounded-[12px] px-3 py-2 text-[13px] font-bold", note.ok ? "bg-app-mint" : "bg-app-danger-tint text-app-danger")}>
            {note.text}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2.5">
          {(summary?.packs ?? []).map((pack) => (
            <button
              key={pack.id}
              type="button"
              disabled={buying !== null}
              onClick={() => void buy(pack)}
              className={cx(
                "relative flex items-center gap-3 rounded-[16px] border-2 px-4 py-3 text-left transition disabled:opacity-60",
                pack.badge === "Most popular" ? "border-app-ink" : "border-app-line hover:border-app-line-strong",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[15px] font-extrabold">{t.dynamic(`credits.pack.${pack.id}`, pack.label)}</span>
                  {pack.badge ? <span className="rounded-full bg-app-ink px-2 py-0.5 text-[10.5px] font-bold text-white">{t.dynamic(`credits.badge.${pack.id}`, pack.badge)}</span> : null}
                </span>
                <span className="block text-[13px] text-app-ink-soft">{t("credits.packCredits", { count: pack.credits })}</span>
              </span>
              <span className="shrink-0 text-right">{buying === pack.id ? <Spinner className="h-5 w-5" /> : <span className="block text-[16px] font-extrabold">{naira(pack.naira)}</span>}</span>
            </button>
          ))}
          {!summary ? (
            <p className="m-0 flex items-center gap-2 text-[13px] text-app-ink-soft">
              <Spinner className="h-4 w-4" /> {t("credits.loading")}
            </p>
          ) : null}
        </div>

        {summary?.autoTopUp ? null : (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-[14px] bg-app-canvas px-3.5 py-3 text-[13px] leading-[1.45]">
            <input type="checkbox" checked={autoOnBuy} onChange={(event) => setAutoOnBuy(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#16141F]" />
            <span>{t("credits.autoOnBuy")}</span>
          </label>
        )}

        {today.length ? (
          <div className="mt-4 grid gap-2 text-[12.5px]">
            <p className="m-0 font-bold">{t("credits.freeToday")}</p>
            {today.map((row) => (
              <div key={row.kind}>
                <div className="flex justify-between gap-2">
                  <span className="text-app-ink-soft">{row.kind === "image" ? t("credits.pictures") : t("credits.replies")}</span>
                  <span className={cx("font-mono tabular-nums", row.used >= row.limit && "font-bold text-app-danger")}>
                    {row.used} / {row.limit}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-app-canvas">
                  <div
                    className={cx("h-full rounded-full", row.used >= row.limit ? "bg-app-danger" : "bg-app-ink")}
                    style={{
                      width: `${Math.min(100, Math.round((row.used / Math.max(1, row.limit)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            <p className="m-0 text-[11.5px] leading-[1.4] text-app-ink-soft">{t("credits.how")}</p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-app-line pt-3">
          <span className="flex items-center gap-1.5 text-[12px] text-app-ink-soft">
            <Icon name="lock" size={12} /> {t("credits.paystack")}
          </span>
          <Link href={manageHref} onClick={() => setOpen(false)} className="text-[13px] font-bold text-app-ink underline underline-offset-2">
            {t("credits.manage")}
          </Link>
        </div>
      </div>
    </div>
  ) : null;

  if (headless) return modal && typeof document !== "undefined" ? createPortal(modal, document.body) : null;

  return (
    <div className={cx("relative shrink-0", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={balance === null ? t("credits.title") : t("credits.aria", { count: balance })}
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className={cx(
          "inline-flex h-10 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[13.5px] font-extrabold sm:h-[42px] sm:gap-1.5 sm:px-3",
          low ? "border-app-accent bg-app-peach text-app-accent-ink" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
        )}
      >
        <Icon name="sparkle" size={15} />
        <span className="font-mono tabular-nums">{balance === null ? "…" : formatNumber(balance, locale)}</span>
        {compact ? null : <span className="hidden xl:inline">{t("credits.short")}</span>}
      </button>
      {modal && typeof document !== "undefined" ? createPortal(modal, document.body) : null}
    </div>
  );
}

/**
 * "Buy credits" for an out-of-credits message: opens the top-up popup when the page has one (top bar, Rex Studio),
 * else opens its own copy of it.
 */
export function BuyCreditsButton({ className, label, manageHref = "/home/credits", variant = "button" }: { className?: string; label?: string; manageHref?: string; variant?: "button" | "link" }) {
  const t = useT("nav");
  const [own, setOwn] = useState(false);
  return (
    <>
      <Link
        href={manageHref}
        onClick={(event) => {
          event.preventDefault();
          if (!openTopUp()) setOwn(true);
        }}
        className={cx(variant === "link" ? "font-bold text-app-ink underline underline-offset-2" : "inline-flex min-h-[40px] w-fit items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white no-underline hover:opacity-90", className)}
      >
        {variant === "link" ? null : <Icon name="sparkle" size={14} />} {label ?? t("credits.buyButton")}
      </Link>
      {own ? <CreditsBadge headless manageHref={manageHref} onClose={() => setOwn(false)} /> : null}
    </>
  );
}

/** True for the API error that means "today's allowance and the credits are used up". */
export function isCreditsError(code: string | null | undefined) {
  return code === "AI_CREDITS_NEEDED";
}
