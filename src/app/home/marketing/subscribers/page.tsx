import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { StatGrid, StatTile } from "@/components/app-kit";
import { RexAICopywriter } from "@/components/marketing/RexAICopywriter";
import { SubscribersManager } from "./SubscribersManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribers" };

export default async function SubscribersPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [total, active, newThisMonth, unsubscribed] = store
    ? await Promise.all([
        db.subscriber.count({ where: { storeId: store.id } }),
        db.subscriber.count({ where: { storeId: store.id, status: "active" } }),
        db.subscriber.count({ where: { storeId: store.id, createdAt: { gte: monthStart } } }),
        db.subscriber.count({ where: { storeId: store.id, status: "unsubscribed" } }),
      ])
    : [0, 0, 0, 0];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Subscribers"
      sub="Everyone who agreed to get emails from your shop."
      actions={<RexAICopywriter storeName={store?.name} />}
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Subscribers" value={total.toLocaleString("en-NG")} />
          <StatTile tone="card" label="Active" value={active.toLocaleString("en-NG")} />
          <StatTile tone="card" label="New this month" value={newThisMonth.toLocaleString("en-NG")} />
          <StatTile tone="card" label="Unsubscribed" value={unsubscribed.toLocaleString("en-NG")} />
        </StatGrid>
        <SubscribersManager />
      </div>
    </SellerPage>
  );
}
