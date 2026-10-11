import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { ChatSettings, type ChatSettingsValue } from "./ChatSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live chat" };

export default async function ChatPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const saved = store ? await db.liveChatConfig.findUnique({ where: { storeId: store.id } }) : null;

  const initial: ChatSettingsValue = {
    mode: saved?.mode === "whatsapp" || saved?.mode === "messaging" || saved?.mode === "multiple" ? saved.mode : "contact_form",
    whatsappNumber: saved?.whatsappNumber ?? "",
    whatsappGreeting: saved?.whatsappGreeting ?? "Hi! How can we help you today?",
    whatsappPosition: saved?.whatsappPosition === "left" ? "left" : "right",
    whatsappColor: saved?.whatsappColor ?? "#25D366",
    showOnMobile: saved?.showOnMobile ?? true,
    showOnDesktop: saved?.showOnDesktop ?? true,
    widgetStyle: saved?.widgetStyle === "bar" || saved?.widgetStyle === "drawer" ? saved.widgetStyle : "bubble",
    contactEmail: saved?.contactEmail ?? "",
    contactPhone: saved?.contactPhone ?? "",
    greeting: saved?.greeting ?? "Have a question? Send us a message and we'll get back to you.",
  };

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Live chat and contact" sub="Choose how shoppers reach you from your store.">
      <ChatSettings initial={initial} />
    </SellerPage>
  );
}
