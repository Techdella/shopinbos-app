import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { CustomiseMenu } from "@/components/settings/CustomiseMenu";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("supplier"))("features.title") };
}

export default async function SupplierFeaturesPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await db.supplier.findUnique({ where: { userId: user.id }, select: { displayName: true, city: true, country: true, logoUrl: true, verificationStatus: true } });
  if (!supplier) redirect("/supplier/onboarding");
  const t = await getT("supplier");
  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("features.title")} sub={t("features.sub")}>
      <CustomiseMenu role="supplier" />
    </AppPage>
  );
}
