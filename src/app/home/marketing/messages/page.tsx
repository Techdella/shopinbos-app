import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, Pill, PillLink, type Tone } from "@/components/app-kit";
import { formatDate } from "@/components/growth/kit";
import { channelStatus } from "@/lib/marketing/channels";
import { getMessagingSettings } from "@/lib/marketing/messaging-settings";
import { CUSTOMER_EVENTS } from "@/lib/marketing/text-channels";
import { listWhatsAppTemplates } from "@/lib/marketing/whatsapp-templates.server";
import { OrderMessages } from "./OrderMessages";
import { EVENT_COPY } from "../_kit/friendly";
import { getLocale, getT } from "@/lib/i18n/server";
import type { MessageKey } from "@shared/i18n/catalog";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("hub.tool.orderMessages") };
}

const STATUS: Record<string, { tone: Tone; label: MessageKey<"marketing"> }> = {
  queued: { tone: "muted", label: "campaignStatus.sending" },
  sent: { tone: "info", label: "campaign.recipient.sent" },
  delivered: { tone: "success", label: "campaign.recipient.delivered" },
  read: { tone: "success", label: "campaign.recipient.read" },
  failed: { tone: "danger", label: "campaign.recipient.failed" },
  skipped: { tone: "warning", label: "hub.notSent" },
};

export default async function OrderMessagesPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  if (!store) redirect("/onboarding");
  const [settings, channels, templates, recent, optOuts] = await Promise.all([
    getMessagingSettings(store.id),
    channelStatus(store.id),
    listWhatsAppTemplates(store.id),
    db.customerMessage.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.marketingOptOut.groupBy({ by: ["channel"], where: { storeId: store.id }, _count: true }),
  ]);
  const optedOut = (channel: string) => optOuts.find((row) => row.channel === channel)?._count ?? 0;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("hub.tool.orderMessages")}
      sub={t("om.sub")}
      actions={<PillLink href="/home/marketing/whatsapp" icon="whatsapp">{t("hub.tool.whatsappTemplates")}</PillLink>}
    >
      <div className="grid gap-5">
        <OrderMessages
          initial={settings}
          channels={{ sms: channels.sms, whatsapp: channels.whatsapp }}
          templates={templates.map((row) => ({ id: row.id, name: row.name, language: row.language, category: row.category, status: row.status, rejectedReason: row.rejectedReason, content: row.content, variables: row.variables, preset: row.preset }))}
          currency={store.currency || "NGN"}
        />
        <Card className="p-5">
          <CardHead title={t("om.recent")} sub={t("om.optedOut", { sms: optedOut("sms"), whatsapp: optedOut("whatsapp") })} />
          {recent.length ? (
            <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
              {recent.map((m) => {
                const s = STATUS[m.status] ?? STATUS.queued;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13.5px]">
                    <span className="min-w-0 flex-1 basis-[220px]">
                      <span className="block truncate font-bold">{t.dynamic(`om.event.${m.event}.label`, EVENT_COPY[m.event]?.label ?? CUSTOMER_EVENTS.find((e) => e.key === m.event)?.label ?? m.event)} · {m.channel === "sms" ? "SMS" : "WhatsApp"}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft" title={m.error ?? undefined}>{m.to}{m.error ? ` · ${t("om.badNumber")}` : ""}</span>
                    </span>
                    <span className="text-[12.5px] text-app-ink-soft">{formatDate(m.createdAt, true, locale)}</span>
                    <Pill tone={s.tone}>{t(s.label)}</Pill>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("om.nothing")}</p>
          )}
        </Card>
      </div>
    </SellerPage>
  );
}
