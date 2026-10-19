"use client";

import { confirmDialog } from "@/components/ui/dialogs";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { naira } from "@shared/onboarding";

export interface CampaignRow {
  id: string;
  name: string;
  mode: string;
  platform: string;
  status: string;
  objective: string | null;
  products: number;
  ads: number;
  image: string | null;
  dailyBudget: number;
  currency: string;
  days: number;
  startAt: string | null;
  endAt: string | null;
  stats: { spend: number; clicks: number; impressions: number; reach: number; orders: number; revenue: number };
  syncError: string | null;
  lastSyncAt: string | null;
  request: { status: string; label: string } | null;
}

export interface RequestRow {
  id: string;
  platform: string;
  status: string;
  label: string;
  businessName: string;
  setupFee: number;
  createdAt: string;
  paid: boolean;
}

const STATUS_TONE: Record<string, string> = { running: "bg-app-success-tint text-app-success", paused: "bg-[#FDF0D5] text-[#8A5A00]", draft: "bg-app-canvas text-app-ink-soft", ended: "bg-app-canvas text-app-ink-soft" };

/** The seller's campaigns (Meta and Shopinbos-managed), with live numbers and controls. */
export function CampaignList({ campaigns, requests }: { campaigns: CampaignRow[]; requests: RequestRow[] }) {
  const t = useT("ads");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const money = (value: number, currency: string) => (currency === "NGN" ? naira(value) : `${value.toLocaleString()} ${currency}`);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale === "en" ? "en-NG" : undefined, { day: "numeric", month: "short" }) : "");

  async function act(id: string, action: string) {
    if (action === "end" && !(await confirmDialog(t("c.confirmEnd")))) return;
    setBusy(`${id}:${action}`);
    setError(null);
    try {
      const response = await fetch(`/api/app/ads/campaigns/${id}`, action === "delete" ? { method: "DELETE" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t("c.err.save"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("c.err.save"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      {error ? <Notice>{error}</Notice> : null}
      {requests.filter((request) => request.status === "awaiting_payment" || !campaigns.some((campaign) => campaign.request?.status === request.status)).length ? (
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[16px] font-extrabold">{t("r.title")}</h2>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-app-canvas px-3 py-2.5 text-[13.5px]">
                <span><strong>{request.platform === "tiktok" ? "TikTok" : "Facebook & Instagram"}</strong> · {request.businessName} · {date(request.createdAt)}</span>
                <span className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-bold", request.paid ? "bg-white" : "bg-[#FDF0D5] text-[#8A5A00]")}>{t.dynamic(`r.status.${request.status}`, request.label)}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{t("r.hint")}</p>
        </section>
      ) : null}

      {campaigns.map((campaign) => {
        const isBusy = (action: string) => busy === `${campaign.id}:${action}`;
        const costPerOrder = campaign.stats.orders ? campaign.stats.spend / campaign.stats.orders : null;
        return (
          <article key={campaign.id} className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5 md:grid-cols-[120px_minmax(0,1fr)]">
            <div className="aspect-square overflow-hidden rounded-[16px] bg-app-canvas">
              {campaign.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={campaign.image} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="grid content-start gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="m-0 text-[17px] font-extrabold">{campaign.name}</h3>
                    <span className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-bold", STATUS_TONE[campaign.status] ?? STATUS_TONE.draft)}>{t.dynamic(`status.${campaign.status}`, campaign.status)}</span>
                  </div>
                  <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">
                    {campaign.mode === "meta" ? t("c.onMeta") : campaign.platform === "tiktok" ? t("c.byTeamTiktok") : t("c.byTeamMeta")}
                    {" · "}{t("c.productsAds", { products: campaign.products, ads: campaign.ads })}
                    {" · "}{t("perDay", { amount: money(campaign.dailyBudget, campaign.currency) })}
                    {campaign.startAt ? ` · ${date(campaign.startAt)} – ${date(campaign.endAt)}` : ""}
                  </p>
                  {campaign.request ? <p className="m-0 mt-1 text-[13px] font-bold">{t("c.teamStatus", { status: t.dynamic(`r.status.${campaign.request.status}`, campaign.request.label) })}</p> : null}
                </div>
                {campaign.mode === "meta" ? (
                  <div className="flex flex-wrap gap-2">
                    {campaign.status === "draft" ? <PillButton size="sm" busy={isBusy("launch")} disabled={busy !== null} onClick={() => void act(campaign.id, "launch")}><Icon name="rocket" size={14} /> {t("c.launch")}</PillButton> : null}
                    {campaign.status === "running" ? <PillButton size="sm" tone="white" busy={isBusy("pause")} disabled={busy !== null} onClick={() => void act(campaign.id, "pause")}>{t("c.pause")}</PillButton> : null}
                    {campaign.status === "paused" ? <PillButton size="sm" busy={isBusy("resume")} disabled={busy !== null} onClick={() => void act(campaign.id, "resume")}>{t("c.resume")}</PillButton> : null}
                    {campaign.status !== "draft" ? <PillButton size="sm" tone="white" busy={isBusy("sync")} disabled={busy !== null} onClick={() => void act(campaign.id, "sync")}><Icon name="refresh" size={14} /></PillButton> : null}
                  </div>
                ) : null}
              </div>

              <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  [t("c.stat.spent"), money(campaign.stats.spend, campaign.currency)],
                  [t("c.stat.seen"), campaign.stats.impressions.toLocaleString()],
                  [t("c.stat.reach"), campaign.stats.reach.toLocaleString()],
                  [t("stat.taps"), campaign.stats.clicks.toLocaleString()],
                  [t("stat.orders"), `${campaign.stats.orders}${costPerOrder ? ` · ${money(costPerOrder, campaign.currency)}` : ""}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[14px] bg-app-canvas px-3 py-2">
                    <dt className="text-[12px] text-app-ink-soft">{label}</dt>
                    <dd className="m-0 text-[15px] font-extrabold">{value}</dd>
                  </div>
                ))}
              </dl>
              {campaign.syncError ? <p className="m-0 rounded-[12px] bg-app-danger-tint px-3 py-2 text-[13px] font-bold text-app-danger">{t("c.metaSaid", { message: campaign.syncError })}</p> : null}
              <div className="flex flex-wrap items-center justify-end gap-3 text-[13px] font-bold">
                {campaign.status === "running" || campaign.status === "paused" ? <button type="button" className="text-app-ink-soft" onClick={() => void act(campaign.id, "end")}>{t("end")}</button> : null}
                {campaign.status !== "running" ? <button type="button" className="text-app-danger" onClick={async () => { if ((await confirmDialog(t("confirmDelete")))) void act(campaign.id, "delete"); }}>{t("c.delete")}</button> : null}
              </div>
            </div>
          </article>
        );
      })}
      {campaigns.length === 0 ? (
        <section className="grid place-items-center gap-3 rounded-[22px] border border-dashed border-app-line-strong bg-white p-8 text-center">
          <p className="m-0 text-[15px] font-bold">{t("c.none")}</p>
          <Link href="/home/ads/new" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline"><Icon name="plus" size={15} /> {t("c.start")}</Link>
        </section>
      ) : null}
    </div>
  );
}
