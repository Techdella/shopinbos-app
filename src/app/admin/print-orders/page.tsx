import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { PrintOrdersManager, type PrintOrderRow } from "@/components/admin/PrintOrdersManager";
import { db } from "@/lib/db/client";
import { isMissingTable } from "@/lib/rate-limit-core";
import { requireRole } from "@/lib/server-auth";
import { cleanDesign } from "@shared/packaging";

export const dynamic = "force-dynamic";

// /admin/print-orders: paid print orders to produce. The print-ready PDF is made in the browser from the design as
// it was ordered.
export default async function AdminPrintOrdersPage() {
  const user = await requireRole(["admin"], "/admin/login");
  let rows: PrintOrderRow[] = [];
  let migrationNeeded = false;
  try {
    const found = await db.printOrder.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    const stores = await db.store.findMany({ where: { id: { in: [...new Set(found.map((row) => row.storeId))] } }, select: { id: true, name: true, slug: true } });
    const byId = new Map(stores.map((store) => [store.id, store]));
    rows = found.map((row) => ({
      id: row.id,
      title: row.title,
      format: row.format,
      design: cleanDesign(row.design),
      quantity: row.quantity,
      material: row.material,
      finish: row.finish,
      unitPrice: row.unitPrice,
      setupFee: row.setupFee,
      deliveryFee: row.deliveryFee,
      total: row.total,
      days: row.days,
      zone: row.zone,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      contactEmail: row.contactEmail,
      address: row.address,
      city: row.city,
      state: row.state,
      notes: row.notes,
      status: row.status,
      tracking: row.tracking,
      adminNotes: row.adminNotes,
      paidAt: row.paidAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      store: byId.get(row.storeId) ?? null,
    }));
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    migrationNeeded = true;
  }
  return (
    <AppPage frame={adminFrame(user, "Search suppliers, products, partners")} title="Print orders" sub="Packaging sellers ordered and paid for. Download the print-ready PDF, print, then mark it shipped with tracking; the seller is emailed.">
      <PrintOrdersManager initial={rows} migrationNeeded={migrationNeeded} />
    </AppPage>
  );
}
