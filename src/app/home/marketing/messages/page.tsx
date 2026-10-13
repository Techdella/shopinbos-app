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

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order messages" };

const STATUS: Record<string, { tone: Tone; label: string }> = {
  queued: { tone: "muted", label: "Sending" },
  sent: { tone: "info", label: "Sent" },
  delivered: { tone: "success", label: "Delivered" },
  read: { tone: "success", label: "Read" },
  failed: { tone: "danger", label: "Didn't send" },
  skipped: { tone: "warning", label: "Not sent" },
};

export default async function OrderMessagesPage() {
  const user = await requireRole(["seller"], "/login");
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
      title="Order messages"
      sub="Send customers WhatsApp and SMS updates about their order, as well as the emails they already get."
      actions={<PillLink href="/home/marketing/whatsapp" icon="whatsapp">WhatsApp templates</PillLink>}
    >
      <div className="grid gap-5">
        <OrderMessages
          initial={settings}
          channels={{ sms: channels.sms, whatsapp: channels.whatsapp }}
          templates={templates.map((t) => ({ id: t.id, name: t.name, language: t.language, category: t.category, status: t.status, rejectedReason: t.rejectedReason, content: t.content, variables: t.variables, preset: t.preset }))}
          currency={store.currency || "NGN"}
        />
        <Card className="p-5">
          <CardHead title="Recently sent" sub={`Asked for no more messages: ${optedOut("sms")} by SMS, ${optedOut("whatsapp")} on WhatsApp.`} />
          {recent.length ? (
            <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
              {recent.map((m) => {
                const s = STATUS[m.status] ?? STATUS.queued;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13.5px]">
                    <span className="min-w-0 flex-1 basis-[220px]">
                      <span className="block truncate font-bold">{EVENT_COPY[m.event]?.label ?? CUSTOMER_EVENTS.find((e) => e.key === m.event)?.label ?? m.event} · {m.channel === "sms" ? "SMS" : "WhatsApp"}</span>
                      <span className="block truncate text-[12.5px] text-app-ink-soft" title={m.error ?? undefined}>{m.to}{m.error ? " · couldn't reach this number. Check it's right." : ""}</span>
                    </span>
                    <span className="text-[12.5px] text-app-ink-soft">{formatDate(m.createdAt, true)}</span>
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">Nothing yet. Messages show here as orders come in.</p>
          )}
        </Card>
      </div>
    </SellerPage>
  );
}
