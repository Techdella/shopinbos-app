import type { Metadata } from "next";
import type { CampaignStatus } from "@prisma/client";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { RexAICopywriter } from "@/components/marketing/RexAICopywriter";
import { formatDate, humanize } from "@/components/growth/kit";
import { naira } from "@shared/onboarding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Campaigns" };

const FILTERS: Array<{ label: string; status?: CampaignStatus }> = [
  { label: "All" },
  { label: "Drafts", status: "draft" },
  { label: "Scheduled", status: "scheduled" },
  { label: "Sent", status: "sent" },
  { label: "Cancelled", status: "cancelled" },
];

const CHANNEL: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

const STATUS: Record<CampaignStatus, { tone: Tone; label: string }> = {
  draft: { tone: "muted", label: "Draft" },
  scheduled: { tone: "info", label: "Scheduled" },
  sending: { tone: "info", label: "Sending" },
  sent: { tone: "success", label: "Sent" },
  cancelled: { tone: "warning", label: "Cancelled" },
};

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export default async function CampaignsPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const active = FILTERS.find((filter) => filter.status === params?.status) ?? FILTERS[0];

  const [campaigns, totals, byStatus] = store
    ? await Promise.all([
        db.broadcastCampaign.findMany({
          where: { storeId: store.id, ...(active.status ? { status: active.status } : {}) },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { id: true, name: true, subject: true, channel: true, campaignType: true, status: true, sentCount: true, deliveredCount: true, openCount: true, clickCount: true, revenueGenerated: true, scheduledAt: true, sentAt: true, createdAt: true },
        }),
        db.broadcastCampaign.aggregate({
          where: { storeId: store.id, status: "sent" },
          _sum: { sentCount: true, openCount: true, clickCount: true, revenueGenerated: true },
        }),
        db.broadcastCampaign.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
      ])
    : [[], null, []];

  const sent = totals?._sum.sentCount ?? 0;
  const opens = totals?._sum.openCount ?? 0;
  const clicks = totals?._sum.clickCount ?? 0;
  const countFor = (status?: CampaignStatus) => byStatus.filter((row) => !status || row.status === status).reduce((sum, row) => sum + row._count, 0);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Campaigns"
      sub="Emails, SMS and WhatsApp messages to your subscribers, buyers or a segment."
      actions={
        <>
          <RexAICopywriter storeName={store?.name} />
          <PillLink href="/home/marketing/templates" icon="mail">Templates</PillLink>
          <PillLink href="/home/marketing/whatsapp" icon="whatsapp">WhatsApp templates</PillLink>
          <PillLink href="/home/marketing/campaigns/new" tone="accent" icon="plus">New campaign</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Messages sent" value={sent.toLocaleString("en-NG")} />
          <StatTile tone="card" label="Opened" value={pct(opens, sent)} hint={`${opens.toLocaleString("en-NG")} opens`} />
          <StatTile tone="card" label="Clicked" value={pct(clicks, opens)} hint="of people who opened" />
          <StatTile tone="card" label="Sales from email" value={naira(totals?._sum.revenueGenerated ?? 0)} />
        </StatGrid>

        <FilterChips
          items={FILTERS.map((filter) => ({
            label: filter.label,
            href: filter.status ? `/home/marketing/campaigns?status=${filter.status}` : "/home/marketing/campaigns",
            count: countFor(filter.status),
            active: filter === active,
          }))}
        />

        {campaigns.length ? (
          <ListCard>
            {campaigns.map((campaign) => {
              const status = STATUS[campaign.status];
              const editable = campaign.status === "draft" || campaign.status === "scheduled";
              return (
                <ListRow key={campaign.id} href={`/home/marketing/campaigns/${campaign.id}`}>
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="block truncate text-[15px] font-extrabold">{campaign.name}</span>
                    <span className="block truncate text-[13px] text-app-ink-soft">{CHANNEL[campaign.channel] ?? "Email"} · {campaign.channel === "email" ? campaign.subject : humanize(campaign.campaignType || "broadcast")}</span>
                  </span>
                  <span className="text-[13px] text-app-ink-soft sm:w-[210px]">
                    {campaign.sentCount.toLocaleString("en-NG")} sent{campaign.channel === "email" ? ` · ${campaign.openCount.toLocaleString("en-NG")} opened · ${campaign.clickCount.toLocaleString("en-NG")} clicked` : ` · ${campaign.deliveredCount.toLocaleString("en-NG")} delivered${campaign.channel === "whatsapp" ? ` · ${campaign.openCount.toLocaleString("en-NG")} read` : ""}`}
                  </span>
                  <span className="text-[13px] text-app-ink-soft sm:w-[120px]">
                    {campaign.scheduledAt ? formatDate(campaign.scheduledAt) : campaign.sentAt ? formatDate(campaign.sentAt) : `Made ${formatDate(campaign.createdAt)}`}
                  </span>
                  <Pill tone={status.tone}>{status.label}</Pill>
                  <span className="text-[13px] font-extrabold text-app-accent-ink">{editable ? "Edit" : "View"}</span>
                </ListRow>
              );
            })}
          </ListCard>
        ) : (
          <EmptyState
            icon="send"
            title={active.status ? `No ${active.label.toLowerCase()} campaigns` : "No campaigns yet"}
            action={<PillLink href="/home/marketing/campaigns/new" tone="ink" icon="plus">New campaign</PillLink>}
          >
            Write one message and send it by email, SMS or WhatsApp to a segment, your subscribers or everyone who bought from you.
          </EmptyState>
        )}
      </div>
    </SellerPage>
  );
}
