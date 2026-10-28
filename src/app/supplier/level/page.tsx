import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { supplierLevelView } from "@/lib/supplier-levels.server";
import { SupplierLevelView } from "@/components/supplier/SupplierLevel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your level" };

// "Your level" (Supplier & Dropship Rules): New → Trusted → Established, worked out fresh from the delivery record
// (src/lib/supplier-levels.server.ts). The goals left to the next level, and what it unlocks. The phone app uses
// GET /api/supplier/level.

export default async function SupplierLevelPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const view = await supplierLevelView(supplier.id);
  if (!view) notFound();

  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Your level" sub="Levels go up by themselves as you deliver well">
      <div className="mx-auto max-w-[960px]">
        <SupplierLevelView view={view} />
      </div>
    </AppPage>
  );
}
