"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { Toggle } from "@/components/app-ui";
import { formatMoney } from "@shared/i18n";
import { RESELL_PCT_DEFAULT, RESELL_PCT_MAX, RESELL_PCT_MIN, cleanResellPct, resellCommission } from "@shared/resell";

// "Let resellers sell this" on the seller's product page (pilot "resell"; the page renders this only while resell is on
// for the shop). The switch and the commission (1–50%) are saved with PUT /api/app/resell/products/[id]. The shop owes
// the commission on sales through a reseller's link; Shopinbos only records it (shared/resell.ts).

type Setting = { enabled: boolean; commissionPct: number; links: number };

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(path, { ...rest, credentials: "same-origin", headers: json !== undefined ? { "content-type": "application/json" } : undefined, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message || String(response.status));
  return body?.data as T;
}

export function ProductResellCard({ productId, price, currency = "NGN" }: { productId: string; price: number; currency?: string }) {
  const t = useT("resell");
  const locale = useLocale();
  const [setting, setSetting] = useState<Setting | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [pct, setPct] = useState(String(RESELL_PCT_DEFAULT));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    call<Setting>(`/api/app/resell/products/${encodeURIComponent(productId)}`)
      .then((loaded) => {
        if (!live) return;
        setSetting(loaded);
        setEnabled(loaded.enabled);
        setPct(String(loaded.commissionPct));
      })
      .catch((error: Error) => live && setLoadError(error.message || t("loadFailed")));
    return () => {
      live = false;
    };
  }, [productId, t]);

  async function save(next: { enabled: boolean; pct: string }) {
    const commissionPct = cleanResellPct(next.pct);
    if (commissionPct === null) {
      setMessage({ tone: "error", text: t("switch.badPct") });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saved = await call<Setting>(`/api/app/resell/products/${encodeURIComponent(productId)}`, { method: "PUT", json: { enabled: next.enabled, commissionPct } });
      setSetting(saved);
      setEnabled(saved.enabled);
      setPct(String(saved.commissionPct));
      setMessage({ tone: "success", text: t("switch.saved") });
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message || t("switch.failed") });
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !setting) return null;
  const typed = cleanResellPct(pct);
  const money = (amount: number) => formatMoney(amount, locale, { currency });

  return (
    <section className="mt-5 rounded-[22px] border border-app-line bg-white p-5" aria-labelledby="resell-title">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="resell-title" className="m-0 text-[17px] font-extrabold">{t("switch.title")}</h2>
          <p className="mb-0 mt-1 text-[14px] leading-[1.55] text-app-ink-soft">{t("switch.sub")}</p>
        </div>
        <Toggle on={enabled} label={t("switch.title")} onChange={(on) => { setEnabled(on); void save({ enabled: on, pct }); }} />
      </div>

      {setting ? (
        <div className="mt-4 grid gap-3">
          <label className="grid max-w-[260px] gap-1.5">
            <span className="text-[13.5px] font-bold">{t("switch.commission")}</span>
            <input
              type="number"
              inputMode="decimal"
              min={RESELL_PCT_MIN}
              max={RESELL_PCT_MAX}
              step="0.5"
              value={pct}
              onChange={(event) => setPct(event.target.value)}
              className="min-h-[44px] rounded-[14px] border border-app-line px-3.5 text-[15px] outline-none focus:border-app-ink"
            />
          </label>
          <p className="m-0 text-[13px] text-app-ink-soft">{t("switch.commissionHint")}</p>
          {typed !== null && price > 0 ? <p className="m-0 text-[14px] font-semibold">{t("switch.example", { price: money(price), amount: money(resellCommission(price, typed)) })}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy} onClick={() => void save({ enabled, pct })} className="min-h-[42px] rounded-full bg-app-ink px-5 text-[14px] font-bold text-white disabled:opacity-60">
              {t("switch.save")}
            </button>
            <span className="text-[13.5px] text-app-ink-soft">{t("switch.links", { count: setting.links })}</span>
            <Link href="/home/resell-sales" className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">{t("switch.seeSales")}</Link>
          </div>
          {message ? <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "m-0 text-[14px] text-app-danger" : "m-0 text-[14px] text-app-success"}>{message.text}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
