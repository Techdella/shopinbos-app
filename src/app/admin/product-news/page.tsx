import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { ProductNewsManager, type BroadcastRow } from "@/components/admin/ProductNewsManager";
import { db } from "@/lib/db/client";
import { appBase, platformLegal } from "@/lib/email/compliance.server";
import { BROADCAST_SELECT, newsImageHosts, withRetryCounts } from "@/lib/email/product-news.server";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function AdminProductNewsPage() {
  const user = await requireRole(["admin"], "/admin/login");
  const broadcasts = await db.productNewsBroadcast.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: BROADCAST_SELECT }).then(withRetryCounts).catch(() => []);
  const rows: BroadcastRow[] = broadcasts.map((b) => ({
    ...b,
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    startedAt: b.startedAt?.toISOString() ?? null,
    sentAt: b.sentAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  }));

  return (
    <AppPage
      frame={adminFrame(user, "Search suppliers, products, partners")}
      title="Product news"
      sub="Tell sellers, suppliers and delivery partners about what's new on Shopinbos. Anyone who turned off product news never gets it."
    >
      <ProductNewsManager initial={rows} appUrl={appBase()} legal={platformLegal()} hosts={newsImageHosts()} adminEmail={user.email} />
    </AppPage>
  );
}
