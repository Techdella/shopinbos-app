import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { RegisterBusiness } from "@/components/business-registration/RegisterBusiness";
import { hideRegistrationPageWhenOff, registrationPageData } from "@/lib/business-registration/page-data.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register your business" };

export default async function SupplierRegisterBusinessPage({ searchParams }: { searchParams?: Promise<{ registration?: string }> }) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const [data, params] = await Promise.all([registrationPageData({ ...user, role: "supplier" }), searchParams]);
  hideRegistrationPageWhenOff(data, "supplier");
  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Register your business" sub="Register your business name with CAC. Once approved, it counts as your CAC document.">
      <RegisterBusiness {...data} result={params?.registration ?? null} />
    </AppPage>
  );
}
