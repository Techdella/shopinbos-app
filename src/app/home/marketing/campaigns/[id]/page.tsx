import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, ListCard, ListRow, Pill, PillLink, SplitLayout, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { DetailList, formatDate } from "@/components/growth/kit";
import { channelStatus } from "@/lib/marketing/channels";
import { listSegments } from "@/lib/marketing/segments";
import { listTemplates } from "@/lib/marketing/templates";
import { parseRecipientFilter } from "@/lib/campaigns/send";
import { readChannelConfig } from "@/lib/marketing/campaign-config";
import { getMessagingSettings } from "@/lib/marketing/messaging-settings";
import { listWhatsAppTemplates } from "@/lib/marketing/whatsapp-templates.server";
import { naira } from "@shared/onboarding";
import { CampaignEditor } from "./CampaignEditor";
import { friendlyName } from "../../_kit/friendly";
import { SentCampaignPreview } from "./SentCampaignPreview";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatNumber } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("campaign.metaTitle") };
}

const STATUS: Record<string, { tone: Tone; label: MessageKey<"marketing"> }> = {
  draft: { tone: "muted", label: "campaignStatus.draft" },
  scheduled: { tone: "info", label: "campaignStatus.scheduled" },
  sending: { tone: "info", label: "campaignStatus.sending" },
  sent: { tone: "success", label: "campaignStatus.sent" },
  cancelled: { tone: "warning", label: "campaignStatus.cancelled" },
};

const RECIPIENT: Record<string, { tone: Tone; label: MessageKey<"marketing"> }> = {
  queued: { tone: "muted", label: "campaign.recipient.queued" },
  sent: { tone: "info", label: "campaign.recipient.sent" },
  delivered: { tone: "success", label: "campaign.recipient.delivered" },
  read: { tone: "success", label: "campaign.recipient.read" },
  failed: { tone: "danger", label: "campaign.recipient.failed" },
};

function pct(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : "0%";
}

/** datetime-local value in Lagos time (WAT, UTC+1). */
function lagosInput(date: Date | null) {
  return date ? new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16) : "";
}

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ template?: string; channel?: string; segment?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing", "common");
  const locale = await getLocale();
  const n = (value: number) => formatNumber(value, locale);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  if (!store) redirect("/onboarding");

  const isNew = id === "new";
  const campaign = isNew ? null : await db.broadcastCampaign.findFirst({ where: { id, storeId: store.id } });
  if (!isNew && !campaign) notFound();

  const [segments, templates, channels] = await Promise.all([listSegments(store.id), listTemplates(store.id), channelStatus(store.id)]);
  const sent = campaign && (campaign.status === "sent" || campaign.status === "sending");

  if (campaign && sent) {
    const [byStatus, recipients, opened, clicked] = await Promise.all([
      db.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: campaign.id }, _count: true }),
      db.campaignRecipient.findMany({ where: { campaignId: campaign.id }, orderBy: [{ convertedAt: "desc" }, { clickedAt: "desc" }, { openedAt: "desc" }], take: 200 }),
      db.campaignRecipient.count({ where: { campaignId: campaign.id, openedAt: { not: null } } }),
      db.campaignRecipient.count({ where: { campaignId: campaign.id, clickedAt: { not: null } } }),
    ]);
    const count = (status: string) => byStatus.find((row) => row.status === status)?._count ?? 0;
    const segment = segments.find((s) => s.id === campaign.segmentId);
    const isEmail = (campaign.channel || "email") === "email";
    const isWhatsApp = campaign.channel === "whatsapp";
    // Text channels: accepted by the provider = sent + delivered + read; receipts move people along.
    const accepted = count("sent") + count("delivered") + count("read");
    const delivered = count("delivered") + count("read");
    const config = readChannelConfig(campaign.channelConfig);
    const waTemplate = isWhatsApp && config.templateId ? (await listWhatsAppTemplates(store.id)).find((row) => row.id === config.templateId) : null;
    return (
      <SellerPage
        user={user}
        store={storeSummary(store)}
        title={campaign.name}
        sub={`${isEmail ? t("channel.email") : campaign.channel === "sms" ? "SMS" : "WhatsApp"} · ${t("campaign.sentOn", { date: formatDate(campaign.sentAt, true, locale, t("campaign.notSet")) })}`}
        actions={<PillLink href="/home/marketing/campaigns" icon="arrowLeft">{t("hub.allCampaigns")}</PillLink>}
      >
        <div className="grid gap-5">
          {campaign.status === "sending" ? <Pill tone="info">{t("campaign.stillSending", { count: count("queued") })}</Pill> : null}
          <StatGrid className="xl:grid-cols-6">
            <StatTile tone="card" label={t("campaign.recipient.sent")} value={n(isEmail ? count("sent") : accepted)} hint={count("failed") ? t("campaign.didntSendCount", { count: count("failed") }) : undefined} />
            {isEmail ? <StatTile tone="card" label={t("campaigns.stat.opened")} value={pct(opened, count("sent"))} hint={t("campaign.people", { count: opened })} /> : null}
            {isEmail ? <StatTile tone="card" label={t("campaigns.stat.clicked")} value={pct(clicked, count("sent"))} hint={t("campaign.people", { count: clicked })} /> : null}
            {!isEmail ? <StatTile tone="card" label={t("campaign.recipient.delivered")} value={pct(delivered, accepted)} hint={t("campaign.people", { count: delivered })} /> : null}
            {isWhatsApp ? <StatTile tone="card" label={t("campaign.recipient.read")} value={pct(count("read"), accepted)} hint={t("campaign.people", { count: count("read") })} /> : null}
            {!isEmail ? <StatTile tone="card" label={t("campaign.recipient.failed")} value={n(count("failed"))} hint={count("queued") ? t("campaign.waitingCount", { count: count("queued") }) : undefined} /> : null}
            <StatTile tone="card" label={t("campaign.orders")} value={campaign.conversionCount} />
            <StatTile tone="card" label={t("campaign.sales")} value={naira(campaign.revenueGenerated)} />
            {isEmail ? <StatTile tone="card" label={t("campaign.unsubscribed")} value={campaign.unsubscribeCount} /> : null}
          </StatGrid>
          <SplitLayout
            sideWidth="440px"
            main={
              <Card className="p-5">
                <CardHead title={t("campaign.whoGotIt")} sub={isEmail ? t("campaign.whoEmail") : isWhatsApp ? t("campaign.whoWhatsApp") : t("campaign.whoSms")} />
                {recipients.length ? (
                  <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                    {recipients.map((recipient) => {
                      const status = RECIPIENT[recipient.status] ?? RECIPIENT.queued;
                      return (
                        <li key={recipient.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
                          <span className="min-w-0 flex-1 basis-[200px]">
                            <span className="block truncate font-bold">{recipient.name || recipient.email}</span>
                            <span className="block truncate text-[12.5px] text-app-ink-soft">{recipient.email}{recipient.error ? ` · ${recipient.error}` : ""}</span>
                          </span>
                          {recipient.convertedAt ? <Pill tone="success">{t("campaign.ordered", { amount: naira(recipient.revenue) })}</Pill> : !isEmail ? null : recipient.clickedAt ? <Pill tone="info">{t("campaigns.stat.clicked")}</Pill> : recipient.openedAt ? <Pill tone="info">{t("campaigns.stat.opened")}</Pill> : null}
                          <Pill tone={status.tone}>{t(status.label)}</Pill>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("campaign.noRecipients")}</p>
                )}
              </Card>
            }
            side={
              <>
                <Card className="p-5">
                  <CardHead title={t("campaign.details")} action={<Pill tone={STATUS[campaign.status]?.tone ?? "muted"}>{STATUS[campaign.status] ? t(STATUS[campaign.status].label) : campaign.status}</Pill>} />
                  <DetailList
                    className="mt-2"
                    rows={[
                      [t("campaign.audience"), segment ? t("campaign.segmentName", { name: segment.name }) : parseRecipientFilter(campaign.recipientFilter).mode === "subscribers" ? t("hub.stat.subscribers") : t("campaign.subscribersAndBuyers")],
                      ...(isEmail ? ([[t("campaign.subject"), campaign.subject]] as Array<[string, string]>) : []),
                      ...(waTemplate ? ([[t("campaign.template"), friendlyName(waTemplate.name)]] as Array<[string, string]>) : []),
                      ...(campaign.channel === "sms" && config.senderId ? ([[t("campaign.senderId"), config.senderId]] as Array<[string, string]>) : []),
                      [t("campaign.recipient.sent"), formatDate(campaign.sentAt, true, locale, t("campaign.notSet"))],
                      [t("campaign.made"), formatDate(campaign.createdAt, true, locale)],
                    ]}
                  />
                </Card>
                <SentCampaignPreview
                  channel={campaign.channel || "email"}
                  bodyHtml={campaign.bodyHtml}
                  preheader={campaign.preheader}
                  subject={campaign.subject}
                  whatsapp={waTemplate ? { content: waTemplate.content, mapping: config.variables?.some(Boolean) ? config.variables : waTemplate.variables, headerImageUrl: config.headerImageUrl ?? null } : null}
                />
              </>
            }
          />
        </div>
      </SellerPage>
    );
  }

  const template = query.template ? templates.library.find((row) => row.key === query.template) ?? templates.saved.find((row) => row.id === query.template) : null;
  const filter = parseRecipientFilter(campaign?.recipientFilter ?? { mode: "all" });
  const [me, waTemplates, productRows, messaging] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { email: true, phone: true } }),
    listWhatsAppTemplates(store.id),
    db.storeProduct.findMany({ where: { storeId: store.id, status: "published" }, orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }], take: 100, select: { id: true, name: true, images: true } }).catch(() => []),
    getMessagingSettings(store.id),
  ]);
  const initialConfig = readChannelConfig(campaign?.channelConfig);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={isNew ? t("hub.newCampaign") : campaign!.name}
      sub={isNew ? t("campaign.newSub") : campaign!.status === "scheduled" ? t("campaign.scheduledFor", { date: formatDate(campaign!.scheduledAt, true, locale) }) : t("campaignStatus.draft")}
      actions={<PillLink href="/home/marketing/campaigns" icon="arrowLeft">{t("hub.allCampaigns")}</PillLink>}
    >
      <CampaignEditor
        initial={{
          id: campaign?.id ?? null,
          status: campaign?.status ?? "draft",
          name: campaign?.name ?? (template ? template.name : ""),
          channel: ((campaign?.channel || query.channel) === "sms" ? "sms" : (campaign?.channel || query.channel) === "whatsapp" ? "whatsapp" : "email"),
          subject: campaign?.subject ?? template?.subject ?? "",
          preheader: campaign?.preheader ?? (template && "preheader" in template ? template.preheader : "") ?? "",
          bodyHtml: campaign?.bodyHtml ?? template?.bodyHtml ?? "",
          segmentId: campaign?.segmentId ?? (query.segment && segments.some((s) => s.id === query.segment) ? query.segment : null),
          audienceMode: filter.mode === "subscribers" ? "subscribers" : "all",
          scheduledAt: lagosInput(campaign?.scheduledAt ?? null),
          channelConfig: initialConfig,
        }}
        waTemplates={waTemplates.map((t) => ({ id: t.id, name: t.name, language: t.language, category: t.category, status: t.status, rejectedReason: t.rejectedReason, content: t.content, variables: t.variables }))}
        products={productRows.map((p) => ({ id: p.id, name: p.name, image: p.images.find((src) => /^https:\/\//.test(src)) ?? null }))}
        sms={{ senderId: messaging.smsSenderId, costPerSegment: messaging.smsCostPerSegment, currency: store.currency || "NGN" }}
        segments={segments.map((s) => ({ id: s.id, name: s.name, summary: s.summary, count: s.count }))}
        templates={[
          ...templates.saved.map((t) => ({ id: t.id, name: t.name, subject: t.subject, preheader: t.preheader, bodyHtml: t.bodyHtml, saved: true })),
          ...templates.library.map((t) => ({ id: t.key, name: t.name, subject: t.subject, preheader: t.preheader, bodyHtml: t.bodyHtml, saved: false })),
        ]}
        channels={{ email: channels.email, sms: channels.sms, whatsapp: channels.whatsapp }}
        testTo={{ email: me?.email ?? user.email ?? null, phone: me?.phone ?? null }}
      />
    </SellerPage>
  );
}
