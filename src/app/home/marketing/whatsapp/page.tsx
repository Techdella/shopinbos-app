import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, MoreActions, PillLink } from "@/components/app-kit";
import { channelStatus } from "@/lib/marketing/channels";
import { listWhatsAppTemplates } from "@/lib/marketing/whatsapp-templates.server";
import { WhatsAppTemplates } from "./WhatsAppTemplates";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("hub.tool.whatsappTemplates") };
}

export default async function WhatsAppTemplatesPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/onboarding");
  const [templates, channels] = await Promise.all([listWhatsAppTemplates(store.id), channelStatus(store.id)]);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("hub.tool.whatsappTemplates")}
      sub={t("wa.sub")}
      actions={
        <>
          <MoreActions>
            <PillLink href="/home/marketing/messages" icon="bell">{t("hub.tool.orderMessages")}</PillLink>
          </MoreActions>
          <PillLink href="/home/marketing/campaigns/new?channel=whatsapp" tone="accent" icon="plus">{t("wa.campaign")}</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <WhatsAppTemplates
          initial={templates.map((row) => ({ id: row.id, name: row.name, language: row.language, category: row.category, status: row.status, rejectedReason: row.rejectedReason, content: row.content, variables: row.variables, preset: row.preset, syncedAt: row.syncedAt?.toISOString() ?? null }))}
          whatsapp={channels.whatsapp}
        />
        <AssistantNote>{t("wa.note")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
