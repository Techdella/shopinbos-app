import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { PackagingRequestsManager, type PackagingRequestRow } from "@/components/admin/PackagingRequestsManager";
import { db } from "@/lib/db/client";
import { isMissingTable } from "@/lib/rate-limit-core";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// /admin/packaging-requests: sellers who asked the Shopinbos branding team for custom packaging, labels or a brand pack.
export default async function AdminPackagingRequestsPage() {
  const user = await requireRole(["admin"], "/admin/login");
  let rows: PackagingRequestRow[] = [];
  let migrationNeeded = false;
  try {
    const found = await db.packagingRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    const stores = await db.store.findMany({ where: { id: { in: [...new Set(found.map((row) => row.storeId))] } }, select: { id: true, name: true, slug: true } });
    const designs = await db.printDesign.findMany({ where: { id: { in: found.map((row) => row.designId).filter((id): id is string => Boolean(id)) } }, select: { id: true, title: true, previewUrl: true } });
    const storeById = new Map(stores.map((store) => [store.id, store]));
    const designById = new Map(designs.map((design) => [design.id, design]));
    rows = found.map((row) => ({
      ...row,
      deadline: row.deadline?.toISOString().slice(0, 10) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      store: storeById.get(row.storeId) ?? null,
      design: row.designId ? designById.get(row.designId) ?? null : null,
    }));
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    migrationNeeded = true;
  }
  return (
    <AppPage frame={adminFrame(user, "Search suppliers, products, partners")} title="Packaging requests" sub="Sellers who want custom packaging, labels or a full brand pack designed and printed. Reach out with ideas and a quote, then move the request along.">
      <PackagingRequestsManager initial={rows} migrationNeeded={migrationNeeded} />
    </AppPage>
  );
}
