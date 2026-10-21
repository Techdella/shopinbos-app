import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PillLink } from "@/components/app-kit";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { db } from "@/lib/db/client";
import { emailSetupView } from "@/lib/email-channel/server";
import { requireRole } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";
import { EmailSetupClient } from "./EmailSetupClient";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("inbox");
  return { title: t("email.title") };
}

const GMAIL_RESULTS = ["connected", "cancelled", "invalid_state", "failed", "scopes", "not_configured"];

export default async function InboxEmailPage({ searchParams }: { searchParams?: Promise<{ gmail?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("inbox");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });
  if (!store) redirect("/builder?firstRun=1");
  const params = await searchParams;
  const view = await emailSetupView(store);
  const gmail = params?.gmail && GMAIL_RESULTS.includes(params.gmail) ? params.gmail : null;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("email.title")}
      sub={t("email.sub")}
      actions={<PillLink href="/home/messages" icon="chat" tone="ink">{t("ch.openInbox")}</PillLink>}
    >
      <PageTip className="mb-5">{tipT("inbox.email")}</PageTip>
      <EmailSetupClient initial={view} gmailResult={gmail} />
    </SellerPage>
  );
}
