import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { CustomiseMenu } from "@/components/settings/CustomiseMenu";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customise your menu" };

export default async function SupplierFeaturesPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { displayName: true, city: true, country: true, logoUrl: true, verificationStatus: true } });
  if (!supplier) redirect("/supplier/onboarding");
  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Customise your menu" sub="Switch off the parts of Shopinbos you don't need. They leave your menu; nothing is deleted.">
      <CustomiseMenu role="supplier" />
    </AppPage>
  );
}
