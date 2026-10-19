import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, FilterChips, PillLink, SplitLayout, StatGrid, StatTile } from "@/components/app-kit";
import { Bars, ShareBar } from "@/components/growth/kit";
import { PAID_ORDER_STATUSES } from "@/lib/insights";
import { SOURCE_LABEL } from "@/lib/marketing/segment-rules";
import { naira } from "@shared/onboarding";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate as formatDay, formatNumber } from "@shared/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("reports.title") };
}

const RANGES = [
  { key: "30", label: "reports.range.30", days: 30 },
  { key: "90", label: "reports.range.90", days: 90 },
  { key: "365", label: "reports.range.365", days: 365 },
] as const;

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "–");
const DAY = 86_400_000;

export default async function MarketingReportsPage({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  const params = await searchParams;
  const range = RANGES.find((r) => r.key === params?.range) ?? RANGES[0];
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing", "common");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const storeId = store?.id ?? "-";
  const since = new Date(Date.now() - range.days * DAY);

  const [campaigns, newSubs, unsubs, flowLogs, rules, recovered, forms, formStats, codeOrders] = await Promise.all([
    db.broadcastCampaign.findMany({ where: { storeId, status: "sent", sentAt: { gte: since } }, orderBy: { sentAt: "desc" }, take: 50, select: { id: true, name: true, channel: true, sentCount: true, openCount: true, clickCount: true, conversionCount: true, revenueGenerated: true, unsubscribeCount: true } }),
    db.subscriber.findMany({ where: { storeId, createdAt: { gte: since } }, select: { createdAt: true, source: true } }),
    db.subscriber.count({ where: { storeId, unsubscribedAt: { gte: since } } }),
    db.automationLog.groupBy({ by: ["automationId", "status"], where: { storeId, createdAt: { gte: since }, stepType: { in: ["send_email", "send_sms", "send_whatsapp", "request_review"] } }, _count: true }),
    db.automationRule.findMany({ where: { storeId }, select: { id: true, name: true, active: true } }),
    db.abandonedCartEvent.findMany({ where: { storeId, createdAt: { gte: since }, remindersSent: { gt: 0 } }, select: { recoveredAt: true, orderId: true } }),
    db.storeForm.findMany({ where: { storeId, OR: [{ isPopup: true }, { type: { in: ["newsletter", "lead", "waitlist", "popup"] } }] }, select: { id: true, name: true, isPopup: true } }),
    db.marketingFormStat.groupBy({ by: ["formId"], where: { storeId, day: { gte: since } }, _sum: { views: true, submissions: true } }),
    db.retailOrder.groupBy({ by: ["discountCode"], where: { storeId, createdAt: { gte: since }, discountCode: { not: null }, status: { in: [...PAID_ORDER_STATUSES] } }, _count: true, _sum: { total: true, discountAmount: true } }),
  ]);

  const recoveredIds = recovered.filter((cart) => cart.recoveredAt && cart.orderId).map((cart) => cart.orderId!);
  const recoveredOrders = recoveredIds.length
    ? await db.retailOrder.aggregate({ where: { id: { in: recoveredIds }, status: { in: [...PAID_ORDER_STATUSES] } }, _sum: { total: true }, _count: true })
    : { _sum: { total: 0 }, _count: 0 };

  const sent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const opens = campaigns.filter((c) => c.channel === "email").reduce((sum, c) => sum + c.openCount, 0);
  const emailSent = campaigns.filter((c) => c.channel === "email").reduce((sum, c) => sum + c.sentCount, 0);
  const clicks = campaigns.reduce((sum, c) => sum + c.clickCount, 0);
  const revenue = campaigns.reduce((sum, c) => sum + c.revenueGenerated, 0);

  // New subscribers per bucket: days for 30, weeks for 90, months for 365.
  const bucketDays = range.days === 30 ? 1 : range.days === 90 ? 7 : 30;
  const buckets = Math.ceil(range.days / bucketDays);
  const growth = Array.from({ length: buckets }, () => 0);
  for (const s of newSubs) {
    const index = Math.floor((s.createdAt.getTime() - since.getTime()) / (bucketDays * DAY));
    if (index >= 0 && index < buckets) growth[index] += 1;
  }
  const label = (i: number) => (locale === "en" ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "short" }).format(new Date(since.getTime() + i * bucketDays * DAY)) : formatDay(new Date(since.getTime() + i * bucketDays * DAY), locale, { day: "numeric", month: "short" }));
  const bySource = new Map<string, number>();
  for (const s of newSubs) bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1);
  const sources = [...bySource.entries()].sort((a, b) => b[1] - a[1]);

  const flowRows = rules
    .map((rule) => {
      const rows = flowLogs.filter((row) => row.automationId === rule.id);
      return { ...rule, sent: rows.find((r) => r.status === "ok")?._count ?? 0, failed: rows.find((r) => r.status === "failed")?._count ?? 0, skipped: rows.find((r) => r.status === "skipped")?._count ?? 0 };
    })
    .filter((row) => row.sent || row.failed || row.skipped || row.active);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("reports.title")}
      sub={t("reports.sub")}
      actions={<PillLink href="/home/marketing" icon="arrowLeft">{t("hub.title")}</PillLink>}
    >
      <div className="grid gap-5">
        <FilterChips items={RANGES.map((r) => ({ label: t(r.label), href: `/home/marketing/analytics?range=${r.key}`, active: r === range }))} />
        <StatGrid className="xl:grid-cols-6">
          <StatTile tone="card" label={t("reports.stat.messages")} value={formatNumber(sent, locale)} hint={t("reports.stat.campaigns", { count: campaigns.length })} />
          <StatTile tone="card" label={t("reports.stat.openRate")} value={pct(opens, emailSent)} />
          <StatTile tone="card" label={t("reports.stat.clickRate")} value={pct(clicks, sent)} />
          <StatTile tone="card" label={t("reports.stat.sales")} value={naira(revenue)} />
          <StatTile tone="card" label={t("reports.stat.cartsBack")} value={recoveredOrders._count} hint={naira(recoveredOrders._sum.total ?? 0)} />
          <StatTile tone="card" label={t("reports.stat.newSubs")} value={formatNumber(newSubs.length, locale)} hint={t("reports.stat.unsubscribed", { count: unsubs })} />
        </StatGrid>

        <SplitLayout
          sideWidth="420px"
          main={
            <>
              <Card className="p-5">
                <CardHead title={t("campaigns.title")} sub={t("reports.campaignsSub")} />
                {campaigns.length ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
                      <thead>
                        <tr className="text-left text-app-ink-soft">
                          {([t("campaign.metaTitle"), t("campaign.recipient.sent"), t("campaigns.stat.opened"), t("campaigns.stat.clicked"), t("campaign.orders"), t("campaign.sales"), t("reports.unsubs")]).map((h) => <th key={h} className="border-b border-app-line py-2 pr-3 font-semibold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c) => (
                          <tr key={c.id} className="border-b border-app-line last:border-0">
                            <td className="max-w-[240px] truncate py-2.5 pr-3"><a href={`/home/marketing/campaigns/${c.id}`} className="font-bold text-app-ink no-underline hover:underline">{c.name}</a> <span className="text-app-ink-soft">· {c.channel === "email" ? t("channel.email") : c.channel === "sms" ? "SMS" : "WhatsApp"}</span></td>
                            <td className="py-2.5 pr-3">{c.sentCount}</td>
                            <td className="py-2.5 pr-3">{c.channel === "email" ? pct(c.openCount, c.sentCount) : "–"}</td>
                            <td className="py-2.5 pr-3">{c.channel === "email" ? pct(c.clickCount, c.sentCount) : "–"}</td>
                            <td className="py-2.5 pr-3">{c.conversionCount}</td>
                            <td className="py-2.5 pr-3 font-bold">{naira(c.revenueGenerated)}</td>
                            <td className="py-2.5 pr-3">{c.unsubscribeCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("reports.noCampaigns")}</p>
                )}
              </Card>

              <Card className="p-5">
                <CardHead title={t("hub.automations")} sub={t("reports.automationsSub")} />
                {flowRows.length ? (
                  <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                    {flowRows.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-[14px]">
                        <a href={`/home/automations/${row.id}`} className="min-w-0 flex-1 truncate font-bold text-app-ink no-underline hover:underline">{row.name}</a>
                        <span><strong>{row.sent}</strong> {t("reports.sentWord")}</span>
                        <span className="text-app-ink-soft">{t("reports.skippedFailed", { skipped: row.skipped, failed: row.failed })}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("reports.noAutomation")}</p>
                )}
                <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">{t("reports.cartReminders", { count: recovered.length, back: recoveredOrders._count, amount: naira(recoveredOrders._sum.total ?? 0) })}</p>
              </Card>
            </>
          }
          side={
            <>
              <Card className="p-5">
                <CardHead title={t("reports.stat.newSubs")} sub={bucketDays === 1 ? t("reports.perDay") : bucketDays === 7 ? t("reports.perWeek") : t("reports.perMonth")} />
                <div className="mt-4">
                  <Bars values={growth} labels={growth.map((_, i) => label(i))} summary={t("reports.growthSummary", { count: newSubs.length, range: t(range.label) })} highlightLast={false} height={140} />
                </div>
                {sources.length ? (
                  <div className="mt-5 grid gap-3">
                    {sources.map(([source, count]) => <ShareBar key={source} label={t.dynamic(`source.${source}`, SOURCE_LABEL[source] ?? source)} value={count} share={count / newSubs.length} />)}
                  </div>
                ) : null}
              </Card>

              <Card className="p-5">
                <CardHead title={t("reports.forms")} />
                {forms.length ? (
                  <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                    {forms.map((form) => {
                      const stat = formStats.find((s) => s.formId === form.id);
                      const views = stat?._sum.views ?? 0;
                      const subs = stat?._sum.submissions ?? 0;
                      return (
                        <li key={form.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                          <span className="min-w-0 truncate font-bold">{form.name}</span>
                          <span className="text-app-ink-soft">{t("reports.signups", { count: subs })}{form.isPopup ? ` · ${t("reports.views", { count: views })} · ${pct(subs, views)}` : ""}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("reports.noForms")}</p>
                )}
              </Card>

              <Card className="p-5">
                <CardHead title={t("reports.codes")} sub={t("reports.codesSub")} />
                {codeOrders.length ? (
                  <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                    {codeOrders.sort((a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0)).slice(0, 10).map((row) => (
                      <li key={row.discountCode} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[14px]">
                        <span className="font-mono font-bold">{row.discountCode}</span>
                        <span className="text-app-ink-soft">{t("reports.codeRow", { count: row._count, total: naira(row._sum.total ?? 0), gave: naira(row._sum.discountAmount ?? 0) })}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("reports.noCodes")}</p>
                )}
              </Card>
            </>
          }
        />
      </div>
    </SellerPage>
  );
}
