"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHead, StatTile } from "@/components/app-kit";
import { Notice, PillButton, Spinner } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Bars } from "@/components/growth/kit";
import { naira } from "@shared/onboarding";

interface AnalyticsData {
  totalSubscribers: number;
  emailsSent: number;
  openRate: number;
  clickRate: number;
  revenueFromEmail: number;
  couponsUsed: number;
  abandonedCarts: number;
  formSubmissions: number;
  topCampaigns: Array<{ name: string; sent: number; opened: number; clicked: number; revenue: number }>;
  recentActivity: Array<{ type: string; message: string; timestamp: string }>;
  subscriberGrowth: Array<{ month: string; count: number }>;
  revenueOverTime: Array<{ month: string; amount: number }>;
}

const ACTIVITY_ICON: Record<string, IconName> = { campaign: "send", subscriber: "users", form: "file" };

export function MarketingAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/store/analytics/marketing");
      const json = await res.json();
      if (!res.ok || !json.data) throw new Error(json?.error?.message ?? "Couldn't load your marketing numbers.");
      setData(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load your marketing numbers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-10 text-[14px] text-app-ink-soft" role="status">
        <Spinner /> Loading your marketing numbers
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid justify-items-start gap-3">
        <Notice>{error ?? "Couldn't load your marketing numbers."}</Notice>
        <PillButton size="sm" tone="white" onClick={() => void load()}>Try again</PillButton>
      </div>
    );
  }

  const growthTotal = data.subscriberGrowth.reduce((sum, row) => sum + row.count, 0);
  const revenueTotal = data.revenueOverTime.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile tone="card" label="Subscribers" value={data.totalSubscribers.toLocaleString("en-NG")} hint="Active" />
        <StatTile tone="card" label="Emails sent" value={data.emailsSent.toLocaleString("en-NG")} hint="Last 20 campaigns" />
        <StatTile tone="card" label="Opened" value={`${data.openRate}%`} />
        <StatTile tone="card" label="Clicked" value={`${data.clickRate}%`} />
        <StatTile tone="card" label="Sales from email" value={naira(data.revenueFromEmail)} />
        <StatTile tone="card" label="Coupons used" value={data.couponsUsed.toLocaleString("en-NG")} />
        <StatTile tone="card" label="Abandoned carts" value={data.abandonedCarts.toLocaleString("en-NG")} />
        <StatTile tone="card" label="Form entries" value={data.formSubmissions.toLocaleString("en-NG")} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <CardHead title="New subscribers" sub={`${growthTotal.toLocaleString("en-NG")} in the last 6 months`} />
          <div className="mt-5">
            <Bars
              values={data.subscriberGrowth.map((row) => row.count)}
              labels={data.subscriberGrowth.map((row) => row.month)}
              summary={`New subscribers per month: ${data.subscriberGrowth.map((row) => `${row.month} ${row.count}`).join(", ")}.`}
              height={160}
            />
          </div>
        </Card>
        <Card className="p-5">
          <CardHead title="Sales from email" sub={`${naira(revenueTotal)} in the last 6 months`} />
          <div className="mt-5">
            <Bars
              values={data.revenueOverTime.map((row) => row.amount)}
              labels={data.revenueOverTime.map((row) => row.month)}
              format={naira}
              summary={`Sales from email per month: ${data.revenueOverTime.map((row) => `${row.month} ${naira(row.amount)}`).join(", ")}.`}
              height={160}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="px-5 pb-3 pt-5"><CardHead title="Best campaigns" sub="By opens" /></div>
          {data.topCampaigns.length ? (
            <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
              {data.topCampaigns.map((campaign, index) => (
                <li key={index} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <span className="min-w-0 flex-1 basis-full truncate text-[14.5px] font-extrabold sm:basis-auto">{campaign.name}</span>
                  <span className="text-[13px] text-app-ink-soft">{campaign.sent} sent · {campaign.opened} opened · {campaign.clicked} clicked</span>
                  <span className="text-[14px] font-extrabold sm:w-[110px] sm:text-right">{naira(campaign.revenue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 border-t border-app-line px-5 py-8 text-center text-[14px] text-app-ink-soft">Send your first campaign to see how it does.</p>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="px-5 pb-3 pt-5"><CardHead title="Recent activity" /></div>
          {data.recentActivity.length ? (
            <ul className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
              {data.recentActivity.map((item, index) => (
                <li key={index} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name={ACTIVITY_ICON[item.type] ?? "code"} size={15} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px]">{item.message}</span>
                    <span className="block text-[12.5px] text-app-ink-soft">{item.timestamp}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 border-t border-app-line px-5 py-8 text-center text-[14px] text-app-ink-soft">Nothing yet. Sent campaigns show up here.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
