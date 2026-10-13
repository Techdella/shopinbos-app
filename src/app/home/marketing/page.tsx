import type { Metadata } from "next";
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

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing" };

// Old ?tab= links (emails, bookmarks) go to the page that now owns each tab.
const LEGACY_TABS: Record<string, string> = {
  Campaigns: "/home/marketing/campaigns",
  Automations: "/home/automations",
  "Email Templates": "/home/marketing/templates",
  "Discounts & Coupons": "/home/discounts",
  "Social Selling": "/channels",
};

const STATUS: Record<string, { tone: Tone; label: string }> = {
  draft: { tone: "muted", label: "Draft" },
  scheduled: { tone: "info", label: "Scheduled" },
  sending: { tone: "info", label: "Sending" },
  sent: { tone: "success", label: "Sent" },
  cancelled: { tone: "warning", label: "Cancelled" },
};

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

export default async function MarketingOverviewPage({ searchParams }: { searchParams?: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  if (params?.tab && LEGACY_TABS[params.tab]) redirect(LEGACY_TABS[params.tab]);

  const user = await requireRole(["seller"], "/login");
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
    { done: livePopups > 0, title: "Turn on a sign-up pop-up", sub: "Collect emails from store visitors, with a small reward", href: "/home/marketing/forms", icon: "mail" },
    { done: flows.some((f) => f.trigger === "abandoned_checkout" && f.active), title: "Remind people about carts they left", sub: "The abandoned-cart automation", href: "/home/automations", icon: "cart" },
    { done: flows.some((f) => f.trigger === "welcome_email" && f.active), title: "Welcome new subscribers", sub: "A hello email the moment they join", href: "/home/automations", icon: "sparkle" },
    { done: segments > 0, title: "Save a segment", sub: "Repeat buyers, big spenders, people in Lagos…", href: "/home/marketing/segments", icon: "layers" },
    { done: campaigns.some((c) => c.status === "sent"), title: "Send your first campaign", sub: "Email, SMS or WhatsApp", href: "/home/marketing/campaigns/new", icon: "send" },
  ];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Marketing"
      sub="Grow your list, send campaigns and let automations follow up for you."
      actions={
        <>
          <RexAICopywriter storeName={store.name} />
          <PillLink href="/home/marketing/campaigns/new" tone="accent" icon="plus">New campaign</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid className="xl:grid-cols-4">
          <StatTile tone="card" label="Subscribers" value={subscribers.toLocaleString("en-NG")} hint={`+${newSubs} in 30 days`} />
          <StatTile tone="card" label="Campaign messages (30 days)" value={sent.toLocaleString("en-NG")} hint={sent ? `${pct(sentTotals._sum.openCount ?? 0, sent)} opened · ${pct(sentTotals._sum.clickCount ?? 0, sent)} clicked` : "None sent yet"} />
          <StatTile tone="card" label="Sales from campaigns (30 days)" value={naira(sentTotals._sum.revenueGenerated ?? 0)} hint={`${sentTotals._sum.conversionCount ?? 0} orders`} />
          <StatTile tone="card" label="Automation messages (30 days)" value={flowSends.toLocaleString("en-NG")} hint={`${flowsOn.length} automation${flowsOn.length === 1 ? "" : "s"} on`} />
        </StatGrid>

        <SplitLayout
          sideWidth="400px"
          main={
            <>
              <Card className="p-5">
                <CardHead title="Recent campaigns" action={<TextLink href="/home/marketing/campaigns">All campaigns</TextLink>} />
                {campaigns.length ? (
                  <ListCard className="mt-3 border-0">
                    {campaigns.map((c) => (
                      <ListRow key={c.id} href={`/home/marketing/campaigns/${c.id}`} className="px-0 sm:px-0">
                        <span className="min-w-0 flex-1 basis-[200px]">
                          <span className="block truncate text-[15px] font-extrabold">{c.name}</span>
                          <span className="block truncate text-[13px] text-app-ink-soft">
                            {c.channel === "sms" ? "SMS" : c.channel === "whatsapp" ? "WhatsApp" : "Email"} · {c.status === "sent" ? `${c.sentCount} sent${c.channel === "email" ? ` · ${pct(c.openCount, c.sentCount)} opened` : ""}` : c.scheduledAt ? `For ${formatDate(c.scheduledAt, true)}` : "Not sent"}
                          </span>
                        </span>
                        {c.revenueGenerated ? <span className="text-[13px] font-bold">{naira(c.revenueGenerated)}</span> : null}
                        <Pill tone={STATUS[c.status]?.tone ?? "muted"}>{STATUS[c.status]?.label ?? c.status}</Pill>
                      </ListRow>
                    ))}
                  </ListCard>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">No campaigns yet. Write one and send it to a segment by email, SMS or WhatsApp.</p>
                )}
              </Card>

              <Card className="p-5">
                <CardHead title="Automations" action={<TextLink href="/home/automations">Manage</TextLink>} />
                {flows.length ? (
                  <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                    {flows.map((flow) => (
                      <li key={flow.id}>
                        <a href={`/home/automations/${flow.id}`} className="flex min-h-[52px] items-center gap-3 py-2 text-app-ink no-underline">
                          <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{flow.name}</span>
                          <span className="text-[13px] text-app-ink-soft">{flow.sent30d} sent</span>
                          <Pill tone={flow.active ? "success" : "muted"} dot>{flow.active ? "On" : "Off"}</Pill>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">None yet. Add welcome, abandoned cart, review request or win-back in one tap.</p>
                )}
              </Card>
            </>
          }
          side={
            <>
              <Card className="p-5">
                <CardHead title="Get set up" sub={`${steps.filter((s) => s.done).length} of ${steps.length} done`} />
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
                <CardHead title="Growing your list" action={<TextLink href="/home/marketing/forms">Forms</TextLink>} />
                <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">
                  {livePopups ? `${livePopups} pop-up${livePopups === 1 ? "" : "s"} live.` : "No pop-up live."} {signups._sum.submissions ?? 0} sign-ups from {signups._sum.views ?? 0} views in 30 days. {discountsLive} discount{discountsLive === 1 ? "" : "s"} live.
                </p>
              </Card>

              <Card className="p-5">
                <CardHead title="Sending channels" />
                <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                  {(["email", "sms", "whatsapp"] as const).map((key) => (
                    <li key={key} className="flex items-start gap-3 text-[14px]">
                      <Icon name={key === "email" ? "mail" : key === "sms" ? "message" : "whatsapp"} size={18} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <strong>{key === "email" ? "Email" : key === "sms" ? "SMS" : "WhatsApp"}</strong>
                        <span className="block text-[12.5px] text-app-ink-soft">
                          {channels[key].ready && (key !== "whatsapp" || channels.whatsapp.templates) ? `Ready via ${channels[key].via}` : "Not connected yet. Tap Help and we'll set it up for you."}{" "}
                          {channels[key].connectHref && !(channels[key].ready && (key !== "whatsapp" || channels.whatsapp.templates)) ? <a href={channels[key].connectHref!} className="font-bold text-app-accent-ink underline">{channels[key].connectLabel}</a> : null}
                        </span>
                      </span>
                      <Pill tone={channels[key].ready && (key !== "whatsapp" || channels.whatsapp.templates) ? "success" : "warning"}>{channels[key].ready && (key !== "whatsapp" || channels.whatsapp.templates) ? "Ready" : "Not set up"}</Pill>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          }
        />

        <nav aria-label="Marketing tools" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {([
            ["/home/marketing/subscribers", "Subscribers", "users", "Your list, consent, tags, import and export"],
            ["/home/marketing/segments", "Segments", "layers", "Groups by spend, orders, place, products"],
            ["/home/marketing/templates", "Email templates", "mail", "Ready-made emails, visual and HTML builder"],
            ["/home/marketing/whatsapp", "WhatsApp templates", "whatsapp", "Meta-approved messages for campaigns and orders"],
            ["/home/marketing/messages", "Order messages", "bell", "WhatsApp and SMS updates: confirmed, shipped, delivered"],
            ["/home/inbox/auto-replies", "Auto-replies", "clock", "Away message, opening hours, quick replies"],
            ["/home/inbox/chatbot", "Peggy chatbot", "sparkle", "Peggy answers shoppers on your live chat"],
            ["/home/marketing/analytics", "Reports", "chart", "What each campaign and automation brought in"],
            ["/home/marketing/rewards", "Rewards and games", "sparkle", "Spin the wheel, scratch cards, loyalty points"],
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
          <EmptyState icon="megaphone" title="Start by collecting emails" action={<PillLink href="/home/marketing/forms" tone="ink">Make a pop-up</PillLink>}>
            Every campaign and automation needs people to send to. A welcome pop-up with a small discount is the quickest start.
          </EmptyState>
        ) : null}
        <AssistantNote>Ask Peggy to “write a campaign for repeat buyers about the new arrivals” or “turn on the abandoned-cart reminder”. She shows you who gets it before anything is sent.</AssistantNote>
      </div>
    </SellerPage>
  );
}
