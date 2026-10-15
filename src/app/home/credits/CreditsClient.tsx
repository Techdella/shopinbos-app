"use client";

import { useState } from "react";
import { Mascot, Notice, PillButton, cx } from "@/components/app-ui";
import { Card, CardHead } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatNumber } from "@shared/i18n";
import { nairaPerCredit, type CreditPack } from "@shared/ai-credits";

interface Overview {
  balance: number;
  autoTopUp: boolean;
  autoPackId: string | null;
  card: { brand: string | null; last4: string | null } | null;
  purchases: Array<{ reference: string; packId: string; credits: number; naira: number; status: string; auto: boolean; createdAt: string }>;
}

async function send(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await response.json().catch(() => null)) as { data?: unknown; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(json?.error?.message ?? "That didn't work. Try again.");
  return json?.data;
}

export function CreditsClient({
  initial,
  packs,
  costs,
  allowance,
  result,
  resultError,
}: {
  initial: Overview;
  packs: CreditPack[];
  costs: Record<string, number>;
  allowance: Array<{ kind: string; label: string; used: number; limit: number }> | null;
  result: "paid" | "failed" | "pending" | null;
  resultError: string | null;
}) {
  const t = useT("payments");
  const locale = useLocale();
  const [overview, setOverview] = useState(initial);
  const [autoOnBuy, setAutoOnBuy] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const naira = (value: number) => `₦${formatNumber(value, locale)}`;
  const packName = (id: string | null) => packs.find((pack) => pack.id === id);

  async function buy(pack: CreditPack) {
    setBuying(pack.id);
    setError(null);
    try {
      const data = (await send("POST", "/api/app/credits/checkout", { packId: pack.id, autoTopUp: autoOnBuy, returnTo: "/home/credits" })) as { authorizationUrl: string };
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("cr.failed"));
      setBuying(null);
    }
  }

  async function changeAuto(next: { autoTopUp: boolean; packId?: string }) {
    setSaving(true);
    setError(null);
    try {
      setOverview((await send("PATCH", "/api/app/credits", next)) as Overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("cr.failed"));
    } finally {
      setSaving(false);
    }
  }

  async function forgetCard() {
    setSaving(true);
    try {
      setOverview((await send("DELETE", "/api/app/credits")) as Overview);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("cr.failed"));
    } finally {
      setSaving(false);
    }
  }

  const low = overview.balance < 20;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 content-start gap-5">
        {result === "paid" ? <Notice tone="success">{t("cr.paid")}</Notice> : null}
        {result === "pending" ? <Notice tone="info">{t("cr.pending")}</Notice> : null}
        {result === "failed" ? <Notice>{resultError ?? t("cr.notPaid")}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}

        <section className="relative overflow-hidden rounded-[22px] bg-app-ink p-6 text-white">
          <div className="flex items-center gap-4">
            <Mascot name="rex" mood={low ? "thinking" : "celebrate"} alt="" className="h-16 w-16 shrink-0" />
            <div className="min-w-0">
              <p className="m-0 text-[13px] font-bold uppercase tracking-[0.12em] text-white/60">{t("cr.balance")}</p>
              <p className="m-0 mt-1 text-[38px] font-extrabold leading-none tracking-[-0.03em]">{formatNumber(overview.balance, locale)}</p>
              <p className="m-0 mt-2 text-[13.5px] text-white/75">{overview.autoTopUp ? t("cr.autoOnLine", { pack: packName(overview.autoPackId)?.credits ?? "" }) : low ? t("cr.lowLine") : t("cr.okLine")}</p>
            </div>
          </div>
        </section>

        <Card>
          <CardHead title={t("cr.buy")} sub={t("cr.buySub")} />
          <ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-3">
            {packs.map((pack) => (
              <li key={pack.id} className={cx("relative flex flex-col rounded-[18px] border p-4", pack.badge ? "border-app-ink" : "border-app-line")}>
                {pack.badge ? <span className="absolute -top-2.5 left-4 rounded-full bg-app-ink px-2.5 py-0.5 text-[11px] font-bold text-white">{t.dynamic(`cr.badge.${pack.id}`, pack.badge)}</span> : null}
                <span className="text-[13px] font-bold text-app-ink-soft">{t.dynamic(`cr.pack.${pack.id}`, pack.label)}</span>
                <span className="mt-1 text-[26px] font-extrabold leading-none">{formatNumber(pack.credits, locale)}</span>
                <span className="text-[12.5px] text-app-ink-soft">{t("cr.credits")}</span>
                <span className="mt-3 text-[17px] font-extrabold">{naira(pack.naira)}</span>
                <span className="text-[12px] text-app-ink-soft">{t("cr.each", { price: naira(nairaPerCredit(pack)) })}</span>
                <PillButton size="sm" tone={pack.badge ? "ink" : "white"} className="mt-4 w-full" busy={buying === pack.id} disabled={buying !== null} onClick={() => void buy(pack)}>
                  {t("cr.buyPack", { price: naira(pack.naira) })}
                </PillButton>
              </li>
            ))}
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[14px] bg-app-canvas px-4 py-3">
            <input type="checkbox" checked={autoOnBuy} onChange={(event) => setAutoOnBuy(event.target.checked)} className="mt-1 h-4 w-4 accent-[#16141F]" />
            <span className="min-w-0">
              <span className="block text-[14px] font-bold">{t("cr.autoOnBuy")}</span>
              <span className="block text-[12.5px] text-app-ink-soft">{t("cr.autoOnBuyHint")}</span>
            </span>
          </label>
          <p className="m-0 mt-3 flex items-center gap-1.5 text-[12.5px] text-app-ink-soft">
            <Icon name="lock" size={13} /> {t("cr.paystack")}
          </p>
        </Card>

        <Card>
          <CardHead title={t("cr.history")} />
          {overview.purchases.length ? (
            <ul className="m-0 mt-3 grid list-none gap-0 p-0">
              {overview.purchases.map((row) => (
                <li key={row.reference} className="flex items-center justify-between gap-3 border-t border-app-line py-3 first:border-t-0 text-[14px]">
                  <span className="min-w-0">
                    <span className="block font-bold">{t("cr.row", { credits: formatNumber(row.credits, locale) })}{row.auto ? ` · ${t("cr.auto")}` : ""}</span>
                    <span className="block text-[12.5px] text-app-ink-soft">{new Date(row.createdAt).toLocaleDateString(locale === "en" ? "en-NG" : undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold">{row.packId.startsWith("plan:") ? t("cr.fromPlan") : naira(row.naira)}</span>
                    <span className={cx("block text-[12.5px]", row.status === "paid" ? "text-app-success" : "text-app-danger")}>{row.status === "paid" ? t("cr.statusPaid") : t("cr.statusFailed")}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 mt-2 text-[14px] text-app-ink-soft">{t("cr.noHistory")}</p>
          )}
        </Card>
      </div>

      <div className="grid min-w-0 content-start gap-5">
        <Card>
          <CardHead title={t("cr.autoTitle")} sub={t("cr.autoSub")} />
          {overview.card ? (
            <div className="mt-4 grid gap-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-[14px] font-bold">{t("cr.autoToggle")}</span>
                <input type="checkbox" role="switch" checked={overview.autoTopUp} disabled={saving} onChange={(event) => void changeAuto({ autoTopUp: event.target.checked })} className="h-5 w-5 accent-[#16141F]" />
              </label>
              <label className="grid gap-1.5 text-[13px] font-bold">
                {t("cr.autoPack")}
                <select
                  value={overview.autoPackId ?? packs[1]?.id}
                  disabled={saving}
                  onChange={(event) => void changeAuto({ autoTopUp: overview.autoTopUp, packId: event.target.value })}
                  className="h-11 rounded-[12px] border border-app-line bg-white px-3 text-[14px] font-medium"
                >
                  {packs.map((pack) => (
                    <option key={pack.id} value={pack.id}>{t("cr.option", { credits: formatNumber(pack.credits, locale), price: naira(pack.naira) })}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between gap-3 rounded-[12px] bg-app-canvas px-3 py-2.5 text-[13.5px]">
                <span className="flex items-center gap-2"><Icon name="card" size={15} /> {t("cr.card", { brand: overview.card.brand ?? "Card", last4: overview.card.last4 ?? "••••" })}</span>
                <button type="button" onClick={() => void forgetCard()} disabled={saving} className="text-[13px] font-bold text-app-danger hover:underline disabled:opacity-50">{t("cr.forget")}</button>
              </div>
              <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("cr.autoSafe")}</p>
            </div>
          ) : (
            <p className="m-0 mt-3 text-[13.5px] leading-[1.5] text-app-ink-soft">{t("cr.noCard")}</p>
          )}
        </Card>

        <Card>
          <CardHead title={t("cr.how")} sub={t("cr.howSub")} />
          <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[13.5px]">
            {Object.entries(costs).map(([kind, cost]) => (
              <li key={kind} className="flex items-center justify-between gap-3">
                <span>{t.dynamic(`cr.kind.${kind}`, kind)}</span>
                <span className="font-bold">{t("cr.cost", { count: cost })}</span>
              </li>
            ))}
          </ul>
          {allowance ? (
            <div className="mt-4 border-t border-app-line pt-3">
              <p className="m-0 text-[13px] font-bold">{t("cr.today")}</p>
              <ul className="m-0 mt-2 grid list-none gap-1.5 p-0 text-[13px] text-app-ink-soft">
                {allowance.map((row) => (
                  <li key={row.kind} className="flex justify-between gap-3">
                    <span>{t.dynamic(`cr.kind.${row.kind}`, row.label)}</span>
                    <span className={cx(row.used >= row.limit && "font-bold text-app-danger")}>{row.used} / {row.limit}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
