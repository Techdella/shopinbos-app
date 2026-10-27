import { AppPage, Card, EmptyState, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { adminFrame } from "@/components/admin/AdminKit";
import { bookSupplierPickup } from "@/app/actions/admin-supplier-orders";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { pickupsNeedingAdmin } from "@/lib/supplier-orders/pickup.server";
import { supplierOrderRef } from "@/lib/supplier-orders/pure";
import { wholesaleRef } from "@/lib/supplier-orders/wholesale.server";
import { pickupWindowText } from "@shared/supplier-pickup";

export const dynamic = "force-dynamic";

// Supplier pickups waiting for a rider: no delivery company covers the supplier's area, or the company cancelled.
// Book one here (the job is created the same way as a supplier's own booking), then message the supplier.

export default async function AdminSupplierPickupsPage({ searchParams }: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const query = (await searchParams) ?? {};
  const pickups = await pickupsNeedingAdmin(100);
  const [suppliers, partners] = await Promise.all([
    db.supplier.findMany({ where: { id: { in: [...new Set(pickups.map((row) => row.supplierId))] } }, select: { id: true, displayName: true, city: true, whatsappNumber: true } }),
    db.logisticsPartner.findMany({ where: { status: "active", verificationStatus: "verified" }, orderBy: [{ reliabilityScore: "desc" }, { displayName: "asc" }], select: { id: true, displayName: true, city: true, codPaused: true }, take: 200 }),
  ]);
  const supplierById = new Map(suppliers.map((row) => [row.id, row]));
  const now = new Date();

  return (
    <AppPage frame={adminFrame(user, "Search suppliers")} title="Pickups waiting for a rider" sub={`${pickups.length} supplier ${pickups.length === 1 ? "parcel needs" : "parcels need"} a delivery company. Book one, then message the supplier.`}>
      {(query.saved || query.error) && <div className="mb-4"><Notice tone={query.error ? "error" : "success"}>{query.error ?? "Rider booked. The supplier has been told."}</Notice></div>}
      {pickups.length === 0 ? (
        <EmptyState icon="truck" title="Nothing waiting">When no delivery company covers a supplier&apos;s area, their pickup shows here.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {pickups.map((pickup) => {
              const supplier = supplierById.get(pickup.supplierId);
              const ref = pickup.orderKind === "wholesale" ? wholesaleRef(pickup.orderId) : supplierOrderRef(pickup.orderId);
              const late = pickup.windowEnd.getTime() < now.getTime();
              return (
                <li key={pickup.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-extrabold">{ref}</span>
                      <Pill tone={late ? "danger" : "warning"} dot>{late ? "Time has passed" : pickupWindowText(pickup.windowStart, pickup.windowEnd, now)}</Pill>
                    </div>
                    <div className="mt-1 text-[14px]">{supplier?.displayName ?? "Supplier"} · {supplier?.city ?? "no city"}{supplier?.whatsappNumber ? ` · ${supplier.whatsappNumber}` : ""}</div>
                    <div className="text-[13.5px] text-app-ink-soft">{pickup.pickupAddress}</div>
                    {pickup.adminNote && <div className="text-[13.5px] text-app-ink-soft">{pickup.adminNote}</div>}
                  </div>
                  <form action={bookSupplierPickup} className="flex flex-wrap items-center gap-2 lg:col-span-2 lg:justify-end">
                    <input type="hidden" name="pickupId" value={pickup.id} />
                    <label htmlFor={`partner-${pickup.id}`} className="sr-only">Delivery company</label>
                    <select id={`partner-${pickup.id}`} name="partnerId" required className="min-h-[40px] rounded-full border border-app-line bg-white px-4 text-[14px]">
                      <option value="">Pick a delivery company</option>
                      {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.displayName} ({partner.city}){partner.codPaused ? " · late pay-in: prepaid only" : ""}</option>)}
                    </select>
                    <button type="submit" className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white">Book this company</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppPage>
  );
}
