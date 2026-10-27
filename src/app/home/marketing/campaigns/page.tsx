import type { Metadata } from "next";
import type { CampaignStatus } from "@prisma/client";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, FilterChips, ListCard, ListRow, MoreActions, Pill, PillLink, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { RexAICopywriter } from "@/components/marketing/RexAICopywriter";
import { formatDate, humanize } from "@/components/growth/kit";
import { naira } from "@shared/onboarding";
import { hasPostalAddress, readBusinessAddress } from "@/lib/email/shell";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";

const PAGE_SIZE = 50;

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("campaigns.title") };
}

const FILTERS: Array<{ label: MessageKey<"marketing">; empty: MessageKey<"marketing">; status?: CampaignStatus }> = [
  { label: "campaigns.filter.all", empty: "campaigns.empty.title" },
  { label: "campaigns.filter.drafts", empty: "campaigns.empty.drafts", status: "draft" },
  { label: "campaigns.filter.scheduled", empty: "campaigns.empty.scheduled", status: "scheduled" },
  { label: "campaigns.filter.sent", empty: "campaigns.empty.sent", status: "sent" },
  { label: "campaigns.filter.cancelled", empty: "campaigns.empty.cancelled", status: "cancelled" },
];

const STATUS: Record<CampaignStatus, { tone: Tone; label: MessageKey<"marketing"> }> = {
  draft: { tone: "muted", label: "campaignStatus.draft" },
  scheduled: { tone: "info", label: "campaignStatus.scheduled" },
  sending: { tone: "info", label: "campaignStatus.sending" },
  sent: { tone: "success", label: "campaignStatus.sent" },
  cancelled: { tone: "warning", label: "campaignStatus.cancelled" },
};

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export default async function CampaignsPage({ searchParams }: { searchParams?: Promise<{ status?: string; page?: string }> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing", "common");
  const locale = await getLocale();
  const n = (value: number) => formatNumber(value, locale);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true } });
  const needsAddress = Boolean(store) && !hasPostalAddress(readBusinessAddress(store?.brandSettings));
  const active = FILTERS.find((filter) => filter.status === params?.status) ?? FILTERS[0];

  const [totals, byStatus] = store
    ? await Promise.all([
        db.broadcastCampaign.aggregate({
          where: { storeId: store.id, status: "sent" },
          _sum: { sentCount: true, openCount: true, clickCount: true, revenueGenerated: true },
        }),
        db.broadcastCampaign.groupBy({ by: ["status"], where: { storeId: store.id }, _count: true }),
      ])
    : [null, []];

  const sent = totals?._sum.sentCount ?? 0;
  const opens = totals?._sum.openCount ?? 0;
  const clicks = totals?._sum.clickCount ?? 0;
  const countFor = (status?: CampaignStatus) => byStatus.filter((row) => !status || row.status === status).reduce((sum, row) => sum + row._count, 0);
  const paging = pageWindow(params?.page, countFor(active.status), PAGE_SIZE);
  const campaigns = store && paging.total
    ? await db.broadcastCampaign.findMany({
        where: { storeId: store.id, ...(active.status ? { status: active.status } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: { id: true, name: true, subject: true, channel: true, campaignType: true, status: true, sentCount: true, deliveredCount: true, openCount: true, clickCount: true, revenueGenerated: true, scheduledAt: true, sentAt: true, createdAt: true },
      })
    : [];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("campaigns.title")}
      sub={t("campaigns.sub")}
      actions={
        <>
          <RexAICopywriter storeName={store?.name} />
          <MoreActions>
            <PillLink href="/home/marketing/templates" icon="mail">{t("campaigns.templates")}</PillLink>
            <PillLink href="/home/marketing/whatsapp" icon="whatsapp">{t("hub.tool.whatsappTemplates")}</PillLink>
          </MoreActions>
          <PillLink href="/home/marketing/campaigns/new" tone="accent" icon="plus">{t("hub.newCampaign")}</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        {needsAddress && (
          <AssistantNote action={<PillLink href="/home/settings?tab=Store#business-address" size="sm" tone="ink">{t("campaigns.addAddress")}</PillLink>}>
            {t("campaigns.addressNote")}
          </AssistantNote>
        )}
        <StatGrid>
          <StatTile tone="card" label={t("campaigns.stat.sent")} value={n(sent)} />
          <StatTile tone="card" label={t("campaigns.stat.opened")} value={pct(opens, sent)} hint={t("campaigns.stat.opens", { count: opens })} />
          <StatTile tone="card" label={t("campaigns.stat.clicked")} value={pct(clicks, opens)} hint={t("campaigns.stat.ofOpened")} />
          <StatTile tone="card" label={t("campaigns.stat.sales")} value={naira(totals?._sum.revenueGenerated ?? 0)} />
        </StatGrid>

        <FilterChips
          items={FILTERS.map((filter) => ({
            label: t(filter.label),
            href: filter.status ? `/home/marketing/campaigns?status=${filter.status}` : "/home/marketing/campaigns",
            count: countFor(filter.status),
            active: filter === active,
          }))}
        />

        {campaigns.length ? (
          <div>
          <ListCard>
            {campaigns.map((campaign) => {
              const status = STATUS[campaign.status];
              const editable = campaign.status === "draft" || campaign.status === "scheduled";
              return (
                <ListRow key={campaign.id} href={`/home/marketing/campaigns/${campaign.id}`}>
                  <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className="block truncate text-[15px] font-extrabold">{campaign.name}</span>
                    <span className="block truncate text-[13px] text-app-ink-soft">{campaign.channel === "sms" ? "SMS" : campaign.channel === "whatsapp" ? "WhatsApp" : t("channel.email")} · {campaign.channel === "email" ? campaign.subject : humanize(campaign.campaignType || "broadcast")}</span>
                  </span>
                  <span className="text-[13px] text-app-ink-soft sm:w-[210px]">
                    {t("hub.sentCount", { count: campaign.sentCount })}{campaign.channel === "email" ? ` · ${t("campaigns.row.opened", { count: campaign.openCount })} · ${t("campaigns.row.clicked", { count: campaign.clickCount })}` : ` · ${t("campaigns.row.delivered", { count: campaign.deliveredCount })}${campaign.channel === "whatsapp" ? ` · ${t("campaigns.row.read", { count: campaign.openCount })}` : ""}`}
                  </span>
                  <span className="text-[13px] text-app-ink-soft sm:w-[120px]">
                    {campaign.scheduledAt ? formatDate(campaign.scheduledAt, false, locale) : campaign.sentAt ? formatDate(campaign.sentAt, false, locale) : t("campaigns.row.made", { date: formatDate(campaign.createdAt, false, locale) })}
                  </span>
                  <Pill tone={status.tone}>{t(status.label)}</Pill>
                  <span className="text-[13px] font-extrabold text-app-accent-ink">{editable ? t("edit") : t("view")}</span>
                </ListRow>
              );
            })}
          </ListCard>
          <Pagination {...paging} base="/home/marketing/campaigns" params={{ status: active.status }} label={t("campaigns.pages")} />
          </div>
        ) : (
          <EmptyState
            icon="send"
            title={t(active.empty)}
            action={<PillLink href="/home/marketing/campaigns/new" tone="ink" icon="plus">{t("hub.newCampaign")}</PillLink>}
          >
            {t("campaigns.empty.body")}
          </EmptyState>
        )}
      </div>
    </SellerPage>
  );
}
