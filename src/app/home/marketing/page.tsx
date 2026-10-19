import type { Metadata } from "next";
import { SMS_ENABLED } from "@/lib/features";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, EmptyState, ListCard, ListRow, Pill, PillLink, SplitLayout, StatGrid, StatTile, TextLink, type Tone } from "@/components/app-kit";
import { Icon, type IconName } from "@/components/ui/Icon";
import { formatDate } from "@/components/growth/kit";
import { RexAICopywriter } from "@/components/marketing/RexAICopywriter";
import { channelStatus } from "@/lib/marketing/channels";
import { listAutomations } from "@/lib/marketing/automations";
import { naira } from "@shared/onboarding";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("hub.title") };
}

// Old ?tab= links (emails, bookmarks) go to the page that now owns each tab.
const LEGACY_TABS: Record<string, string> = {
  Campaigns: "/home/marketing/campaigns",
  Automations: "/home/automations",
  "Email Templates": "/home/marketing/templates",
  "Discounts & Coupons": "/home/discounts",
  "Social Selling": "/channels",
};

const STATUS: Record<string, { tone: Tone; label: MessageKey<"marketing"> }> = {
  draft: { tone: "muted", label: "campaignStatus.draft" },
  scheduled: { tone: "info", label: "campaignStatus.scheduled" },
  sending: { tone: "info", label: "campaignStatus.sending" },
  sent: { tone: "success", label: "campaignStatus.sent" },
  cancelled: { tone: "warning", label: "campaignStatus.cancelled" },
};

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

export default async function MarketingOverviewPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  if (params?.tab && LEGACY_TABS[params.tab]) redirect(LEGACY_TABS[params.tab]);

  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing", "common");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/onboarding");
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [subscribers, newSubs, campaigns, sentTotals, flows, livePopups, signups, discountsLive, channels, segments] = await Promise.all([
    db.subscriber.count({ where: { storeId: store.id, status: "active" } }),
    db.subscriber.count({ where: { storeId: store.id, status: "active", createdAt: { gte: since } } }),
    db.broadcastCampaign.findMany({ where: { storeId: store.id }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, name: true, channel: true, status: true, sentCount: true, openCount: true, clickCount: true, revenueGenerated: true, sentAt: true, scheduledAt: true } }),
    db.broadcastCampaign.aggregate({ where: { storeId: store.id, status: "sent", sentAt: { gte: since } }, _sum: { sentCount: true, openCount: true, clickCount: true, revenueGenerated: true, conversionCount: true } }),
    listAutomations(store.id, since),
    db.storeForm.count({ where: { storeId: store.id, isPopup: true, active: true } }),
    db.marketingFormStat.aggregate({ where: { storeId: store.id, day: { gte: since } }, _sum: { views: true, submissions: true } }),
    db.discount.count({ where: { storeId: store.id, status: "active" } }),
    channelStatus(store.id),
    db.customerSegment.count({ where: { storeId: store.id } }),
  ]);
  const sent = sentTotals._sum.sentCount ?? 0;
  const flowsOn = flows.filter((f) => f.active);
  const flowSends = flows.reduce((sum, f) => sum + f.sent30d, 0);

  const steps: Array<{ done: boolean; title: string; sub: string; href: string; icon: IconName }> = [
    { done: livePopups > 0, title: t("hub.step.popup"), sub: t("hub.step.popupSub"), href: "/home/marketing/forms", icon: "mail" },
    { done: flows.some((f) => f.trigger === "abandoned_checkout" && f.active), title: t("hub.step.cart"), sub: t("hub.step.cartSub"), href: "/home/automations", icon: "cart" },
    { done: flows.some((f) => f.trigger === "welcome_email" && f.active), title: t("hub.step.welcome"), sub: t("hub.step.welcomeSub"), href: "/home/automations", icon: "sparkle" },
    { done: segments > 0, title: t("hub.step.segment"), sub: t("hub.step.segmentSub"), href: "/home/marketing/segments", icon: "layers" },
    { done: campaigns.some((c) => c.status === "sent"), title: t("hub.step.campaign"), sub: t("hub.step.campaignSub"), href: "/home/marketing/campaigns/new", icon: "send" },
  ];
  const ready = (key: "email" | "sms" | "whatsapp") => channels[key].ready && (key !== "whatsapp" || channels.whatsapp.templates);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("hub.title")}
      sub={t("hub.sub")}
      actions={
        <>
          <RexAICopywriter storeName={store.name} />
          <PillLink href="/home/marketing/campaigns/new" tone="accent" icon="plus">{t("hub.newCampaign")}</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid className="xl:grid-cols-4">
          <StatTile tone="card" label={t("hub.stat.subscribers")} value={formatNumber(subscribers, locale)} hint={t("hub.stat.subscribersHint", { count: newSubs })} />
          <StatTile tone="card" label={t("hub.stat.campaignMessages")} value={formatNumber(sent, locale)} hint={sent ? t("hub.stat.openedClicked", { opened: pct(sentTotals._sum.openCount ?? 0, sent), clicked: pct(sentTotals._sum.clickCount ?? 0, sent) }) : t("hub.stat.noneSent")} />
          <StatTile tone="card" label={t("hub.stat.campaignSales")} value={naira(sentTotals._sum.revenueGenerated ?? 0)} hint={t("count.orders", { count: sentTotals._sum.conversionCount ?? 0 })} />
          <StatTile tone="card" label={t("hub.stat.automationMessages")} value={formatNumber(flowSends, locale)} hint={t("hub.stat.automationsOn", { count: flowsOn.length })} />
        </StatGrid>

        <SplitLayout
          sideWidth="400px"
          main={
            <>
              <Card className="p-5">
                <CardHead title={t("hub.recentCampaigns")} action={<TextLink href="/home/marketing/campaigns">{t("hub.allCampaigns")}</TextLink>} />
                {campaigns.length ? (
                  <ListCard className="mt-3 border-0">
                    {campaigns.map((c) => (
                      <ListRow key={c.id} href={`/home/marketing/campaigns/${c.id}`} className="px-0 sm:px-0">
                        <span className="min-w-0 flex-1 basis-[200px]">
                          <span className="block truncate text-[15px] font-extrabold">{c.name}</span>
                          <span className="block truncate text-[13px] text-app-ink-soft">
                            {c.channel === "sms" ? "SMS" : c.channel === "whatsapp" ? "WhatsApp" : t("channel.email")} · {c.status === "sent" ? `${t("hub.sentCount", { count: c.sentCount })}${c.channel === "email" ? ` · ${t("hub.openedPct", { pct: pct(c.openCount, c.sentCount) })}` : ""}` : c.scheduledAt ? t("hub.scheduledFor", { date: formatDate(c.scheduledAt, true, locale) }) : t("hub.notSent")}
                          </span>
                        </span>
                        {c.revenueGenerated ? <span className="text-[13px] font-bold">{naira(c.revenueGenerated)}</span> : null}
                        <Pill tone={STATUS[c.status]?.tone ?? "muted"}>{STATUS[c.status] ? t(STATUS[c.status].label) : c.status}</Pill>
                      </ListRow>
                    ))}
                  </ListCard>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("hub.noCampaigns")}</p>
                )}
              </Card>

              <Card className="p-5">
                <CardHead title={t("hub.automations")} action={<TextLink href="/home/automations">{t("hub.manage")}</TextLink>} />
                {flows.length ? (
                  <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                    {flows.map((flow) => (
                      <li key={flow.id}>
                        <a href={`/home/automations/${flow.id}`} className="flex min-h-[52px] items-center gap-3 py-2 text-app-ink no-underline">
                          <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{flow.name}</span>
                          <span className="text-[13px] text-app-ink-soft">{t("hub.sentCount", { count: flow.sent30d })}</span>
                          <Pill tone={flow.active ? "success" : "muted"} dot>{flow.active ? t("status.active") : t("status.inactive")}</Pill>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("hub.noAutomations")}</p>
                )}
              </Card>
            </>
          }
          side={
            <>
              <Card className="p-5">
                <CardHead title={t("hub.getSetUp")} sub={t("hub.stepsDone", { done: steps.filter((s) => s.done).length, total: steps.length })} />
                <ul className="m-0 mt-3 grid list-none gap-1 p-0">
                  {steps.map((step) => (
                    <li key={step.title}>
                      <a href={step.href} className="flex min-h-[56px] items-center gap-3 rounded-[14px] px-2 py-2 text-app-ink no-underline hover:bg-app-canvas">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${step.done ? "bg-app-success-tint text-app-success" : "bg-app-canvas"}`}>
                          <Icon name={step.done ? "check" : step.icon} size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[14px] font-bold ${step.done ? "text-app-ink-soft line-through" : ""}`}>{step.title}</span>
                          <span className="block truncate text-[12.5px] text-app-ink-soft">{step.sub}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-5">
                <CardHead title={t("hub.growingList")} action={<TextLink href="/home/marketing/forms">{t("hub.forms")}</TextLink>} />
                <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">
                  {t("hub.popupsLive", { count: livePopups })} {t("hub.signupsFromViews", { signups: signups._sum.submissions ?? 0, views: signups._sum.views ?? 0 })} {t("hub.discountsLive", { count: discountsLive })}
                </p>
              </Card>

              <Card className="p-5">
                <CardHead title={t("hub.sendingChannels")} />
                <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                  {(SMS_ENABLED ? (["email", "sms", "whatsapp"] as const) : (["email", "whatsapp"] as const)).map((key) => (
                    <li key={key} className="flex items-start gap-3 text-[14px]">
                      <Icon name={key === "email" ? "mail" : key === "sms" ? "message" : "whatsapp"} size={18} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <strong>{key === "email" ? t("channel.email") : key === "sms" ? "SMS" : "WhatsApp"}</strong>
                        <span className="block text-[12.5px] text-app-ink-soft">
                          {ready(key) ? t("hub.readyVia", { via: channels[key].via }) : t("hub.notConnected")}{" "}
                          {channels[key].connectHref && !ready(key) ? <a href={channels[key].connectHref!} className="font-bold text-app-accent-ink underline">{channels[key].connectLabel}</a> : null}
                        </span>
                      </span>
                      <Pill tone={ready(key) ? "success" : "warning"}>{ready(key) ? t("hub.ready") : t("hub.notSetUp")}</Pill>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          }
        />

        <nav aria-label={t("hub.tools")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {([
            ["/home/marketing/subscribers", t("hub.tool.subscribers"), "users", t("hub.tool.subscribersSub")],
            ["/home/marketing/segments", t("hub.tool.segments"), "layers", t("hub.tool.segmentsSub")],
            ["/home/marketing/templates", t("hub.tool.emailTemplates"), "mail", t("hub.tool.emailTemplatesSub")],
            ["/home/marketing/whatsapp", t("hub.tool.whatsappTemplates"), "whatsapp", t("hub.tool.whatsappTemplatesSub")],
            ["/home/marketing/messages", t("hub.tool.orderMessages"), "bell", t("hub.tool.orderMessagesSub")],
            ["/home/inbox/auto-replies", t("hub.tool.autoReplies"), "clock", t("hub.tool.autoRepliesSub")],
            ["/home/inbox/chatbot", t("hub.tool.chatbot"), "sparkle", t("hub.tool.chatbotSub")],
            ["/home/marketing/analytics", t("hub.tool.reports"), "chart", t("hub.tool.reportsSub")],
            ["/home/marketing/rewards", t("hub.tool.rewards"), "sparkle", t("hub.tool.rewardsSub")],
          ] as Array<[string, string, IconName, string]>).map(([href, label, icon, sub]) => (
            <a key={href} href={href} className="flex items-center gap-3 rounded-[22px] border border-app-line bg-white p-4 text-app-ink no-underline hover:border-app-line-strong">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-app-canvas"><Icon name={icon} size={18} /></span>
              <span className="min-w-0">
                <span className="block text-[15px] font-extrabold">{label}</span>
                <span className="block truncate text-[12.5px] text-app-ink-soft">{sub}</span>
              </span>
            </a>
          ))}
        </nav>

        {subscribers === 0 && !campaigns.length ? (
          <EmptyState icon="megaphone" title={t("hub.empty.title")} action={<PillLink href="/home/marketing/forms" tone="ink">{t("hub.empty.action")}</PillLink>}>
            {t("hub.empty.body")}
          </EmptyState>
        ) : null}
        <AssistantNote>{t("hub.peggyNote")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
