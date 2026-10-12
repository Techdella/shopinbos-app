import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, PillLink } from "@/components/app-kit";
import { channelStatus } from "@/lib/marketing/channels";
import { listWhatsAppTemplates } from "@/lib/marketing/whatsapp-templates.server";
import { WhatsAppTemplates } from "./WhatsAppTemplates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "WhatsApp messages" };

export default async function WhatsAppTemplatesPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/onboarding");
  const [templates, channels] = await Promise.all([listWhatsAppTemplates(store.id), channelStatus(store.id)]);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="WhatsApp messages"
      sub="Messages WhatsApp has approved, so you can send offers and order updates to customers any time, not only when they message you first."
      actions={
        <>
          <PillLink href="/home/marketing/messages" icon="bell">Order messages</PillLink>
          <PillLink href="/home/marketing/campaigns/new?channel=whatsapp" tone="accent" icon="plus">Send a WhatsApp message</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <WhatsAppTemplates
          initial={templates.map((t) => ({ id: t.id, name: t.name, language: t.language, category: t.category, status: t.status, rejectedReason: t.rejectedReason, content: t.content, variables: t.variables, preset: t.preset, syncedAt: t.syncedAt?.toISOString() ?? null }))}
          whatsapp={channels.whatsapp}
        />
        <AssistantNote>WhatsApp usually approves a message within minutes, sometimes up to a day. An order update must only be about an order; anything with an offer is a promotion, and WhatsApp may change it to one.</AssistantNote>
      </div>
    </SellerPage>
  );
}
