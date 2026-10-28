import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { BrandingOfferForm } from "@/components/supplier/BrandingOfferForm";
import { supplierBrandingView } from "@/lib/supplier-dropship.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Branding you offer" };

// Branding the supplier offers sellers who dropship from them (Supplier & Dropship Rules, shared/dropship-rules.ts):
// blind packing and the seller's name on tracking always; the seller's packing slip and stickers from Trusted up;
// custom packaging quoted in chat. The phone app uses GET/PUT /api/supplier/branding.
export default async function SupplierBrandingPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const view = await supplierBrandingView(supplier.id);

  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Branding you offer" sub="What you can do for shops that dropship from you">
      <div className="mx-auto grid max-w-[720px] gap-4">
        <BrandingOfferForm initial={view} />
      </div>
    </AppPage>
  );
}
