import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { AdRequestsManager } from "@/components/admin/AdRequestsManager";
import { db } from "@/lib/db/client";
import { isMissingTable } from "@/lib/rate-limit-core";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// /admin/ad-requests: sellers who asked the Shopinbos team to set up TikTok or Meta ads (and paid the setup fee).
export default async function AdminAdRequestsPage() {
  const user = await requireRole(["admin"], "/admin/login");
  let rows: Awaited<ReturnType<typeof load>> = [];
  let migrationNeeded = false;
  async function load() {
    const found = await db.adServiceRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    const stores = await db.store.findMany({ where: { id: { in: [...new Set(found.map((row) => row.storeId))] } }, select: { id: true, name: true, slug: true } });
    const byId = new Map(stores.map((store) => [store.id, store]));
    return found.map((row) => ({
      ...row,
      paidAt: row.paidAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: byId.get(row.storeId) ?? null,
    }));
  }
  try {
    rows = await load();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    migrationNeeded = true;
  }
  return (
    <AppPage frame={adminFrame(user, "Search suppliers, products, partners")} title="Ad requests" sub="Sellers who paid for the Shopinbos team to set up TikTok or Facebook & Instagram ads. Contact them, set it up, then move the request along.">
      <AdRequestsManager initial={rows} migrationNeeded={migrationNeeded} />
    </AppPage>
  );
}
