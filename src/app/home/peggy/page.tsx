import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppFrame } from "@/components/shell/AppFrame";
import { requireRole } from "@/lib/server-auth";
import { buildSellerSnapshot, greetingFor, type SellerSnapshot } from "@/lib/ai/peggy/context";
import { PeggyChat } from "./PeggyChat";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

// Ask Peggy (2026 seller app): a full-page chat with the shop assistant. She reads live shop data and acts
// through her tools via POST /api/app/peggy. `?ask=...` prefills the box (e.g. from the blog CMS).

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("peggy");
  return { title: t("metaTitle") };
}

/** Prompts Peggy can actually carry out, picked for what this shop needs today. */
function suggestionsFor(snapshot: SellerSnapshot, t: TFunction<MessageKey<"peggy">>) {
  const list: string[] = [];
  const best = snapshot.products.bestSellers[0]?.name ?? snapshot.products.recent[0]?.name;
  if (snapshot.orders.toSend > 0) list.push(t("suggest.rider"));
  if (snapshot.orders.awaitingPayment > 0) list.push(t("suggest.unpaid"));
  if (snapshot.products.lowStock > 0) list.push(t("suggest.restock"));
  list.push(t("suggest.week"));
  if (snapshot.products.drafts > 0) list.push(t("suggest.drafts"));
  list.push(t("suggest.discount"));
  if (best) list.push(t("suggest.caption", { product: best }));
  if (best) list.push(t("suggest.blog", { product: best }));
  list.push(t("suggest.bestCustomers"));
  list.push(t("suggest.email"));
  return [...new Set(list)].slice(0, 6);
}

export default async function PeggyPage({ searchParams }: { searchParams: Promise<{ ask?: string | string[] }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("peggy");
  const snapshot = await buildSellerSnapshot(user.id);
  if (!snapshot.store) redirect("/onboarding/rex");
  const params = await searchParams;
  const ask = (Array.isArray(params.ask) ? params.ask[0] : params.ask)?.slice(0, 2000) ?? "";
  const initials = user.name.split(/\s+/).map((part) => part[0]).join("").toUpperCase().slice(0, 2);

  return (
    <AppFrame
      role="seller"
      storeName={snapshot.store.name}
      storeSlug={snapshot.store.slug}
      storeInitial={snapshot.store.name.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={initials}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <PeggyChat
        greeting={greetingFor(user.name, snapshot)}
        initialAsk={ask}
        suggestions={suggestionsFor(snapshot, t)}
        stats={{
          today: snapshot.sales.today,
          week: snapshot.sales.last7Days,
          toSend: snapshot.orders.toSend,
          unpaid: snapshot.orders.awaitingPayment,
          lowStock: snapshot.products.lowStock,
          unread: snapshot.messages.unread,
          drafts: snapshot.products.drafts,
        }}
      />
    </AppFrame>
  );
}
