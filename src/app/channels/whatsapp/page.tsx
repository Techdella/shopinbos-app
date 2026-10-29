import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n/server";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { embeddedSignupConfig } from "@/lib/inbox/channels/whatsapp";
import { appReturnUrl } from "@/lib/sales-channels/pure";
import { APP_CONNECTED_DEEP_LINK, appConnectedDeepLink, appConnectedPagePath, type AppConnectStatus } from "@shared/app-connect";
import { WhatsAppAppConnect } from "./WhatsAppAppConnect";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("social");
  return { title: t("appWa.title"), robots: { index: false } };
}

// Connect WhatsApp from the phone app (shared/app-connect.ts): the app opens this page signed in (/auth/handoff) in
// an in-app browser with ?app=shopinbos://connected. One button runs Meta's Embedded Signup (the same popup and
// POST /api/app/inbox/whatsapp as the WhatsApp card on /channels); then the browser goes back into the app through
// /api/mobile/connected. Nothing here links to the rest of the website.

export default async function WhatsAppForApp({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  const query = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const app = appReturnUrl(query.app) ?? APP_CONNECTED_DEEP_LINK;
  const back = (status: AppConnectStatus) => appConnectedPagePath(appConnectedDeepLink(app, "whatsapp", status));
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  const signup = embeddedSignupConfig();
  if (!store || !signup) redirect(back("problem"));
  return <WhatsAppAppConnect signup={signup} links={{ connected: back("connected"), closed: back("closed") }} />;
}
