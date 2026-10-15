"use client";

import { useEffect, useState } from "react";
import { Card, CardHead, StatGrid, StatTile } from "@/components/app-kit";
import { Notice, Spinner } from "@/components/app-ui";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney, formatNumber } from "@shared/i18n";
import type { CampaignAnalytics, CampaignDetail } from "@/lib/store-campaigns/types";
import { api, errorText } from "../../marketing/_kit/client";
import { formatZoned } from "../format";

// The campaign report: visits, bar clicks, pop-up results, emails, orders and sales in the window, orders with the
// linked discount, and the same number of days before the campaign for comparison.

function change(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

export function ReportTab({ campaign }: { campaign: CampaignDetail }) {
  const t = useT("campaigns");
  const locale = useLocale();
  const [data, setData] = useState<CampaignAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ analytics: CampaignAnalytics }>(`/api/app/campaigns/${campaign.id}/analytics`, "GET")
      .then((result) => !cancelled && setData(result.analytics))
      .catch((loadError) => !cancelled && setError(errorText(loadError)));
    return () => {
      cancelled = true;
    };
  }, [campaign.id]);

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <div className="flex items-center gap-2 text-[14px] text-app-ink-soft"><Spinner /> {t("report.loading")}</div>;
  if (!data.window) return <Card className="p-6 text-[14px] text-app-ink-soft">{t("report.notStarted")}</Card>;

  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const num = (value: number) => formatNumber(value, locale);
  const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");
  const revenueChange = change(data.revenue, data.previousRevenue);
  const ordersChange = change(data.orders, data.previousOrders);
  const trend = (value: number | null) => (value === null ? t("report.noBefore") : value >= 0 ? t("report.up", { percent: value }) : t("report.down", { percent: Math.abs(value) }));

  return (
    <div className="grid gap-5">
      <p className="m-0 text-[13.5px] text-app-ink-soft">{t("report.window", { start: formatZoned(data.window.from, campaign.timezone, locale), end: formatZoned(data.window.to, campaign.timezone, locale) })}</p>
      <StatGrid>
        <StatTile tone="card" label={t("report.revenue")} value={naira(data.revenue)} hint={trend(revenueChange)} />
        <StatTile tone="card" label={t("report.orders")} value={num(data.orders)} hint={trend(ordersChange)} />
        <StatTile tone="card" label={t("report.sessions")} value={num(data.sessions)} />
        <StatTile tone="card" label={t("report.discountOrders")} value={num(data.discountOrders)} hint={campaign.discount ? naira(data.discountRevenue) : t("report.noDiscount")} />
      </StatGrid>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <CardHead title={t("report.blocks")} />
          <dl className="m-0 mt-3 divide-y divide-app-line">
            {[
              [t("report.barViews"), num(data.blockViews)],
              [t("report.barClicks"), `${num(data.clicks)} · ${pct(data.clicks, data.blockViews)}`],
              [t("report.popupShown"), num(data.popupShown)],
              [t("report.popupClosed"), num(data.popupClosed)],
              [t("report.popupConverted"), `${num(data.popupConverted)} · ${pct(data.popupConverted, data.popupShown)}`],
              [t("report.emails"), num(data.emails)],
            ].map(([label, value]) => (
              <div key={label} className="flex min-h-[42px] items-center justify-between gap-3 py-2 text-[14px]">
                <dt className="text-app-ink-soft">{label}</dt>
                <dd className="m-0 font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-5">
          <CardHead title={t("report.compare")} sub={data.previous ? t("report.compareSub", { start: formatZoned(data.previous.from, campaign.timezone, locale), end: formatZoned(data.previous.to, campaign.timezone, locale) }) : undefined} />
          <dl className="m-0 mt-3 divide-y divide-app-line">
            {[
              [t("report.revenue"), `${naira(data.revenue)} / ${naira(data.previousRevenue)}`],
              [t("report.orders"), `${num(data.orders)} / ${num(data.previousOrders)}`],
            ].map(([label, value]) => (
              <div key={label} className="flex min-h-[42px] items-center justify-between gap-3 py-2 text-[14px]">
                <dt className="text-app-ink-soft">{label}</dt>
                <dd className="m-0 font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 mt-3 text-[12.5px] text-app-ink-soft">{t("report.compareNote")}</p>
        </Card>
      </div>
    </div>
  );
}
