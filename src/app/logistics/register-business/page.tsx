import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { RegisterBusiness } from "@/components/business-registration/RegisterBusiness";
import { hideRegistrationPageWhenOff, registrationPageData } from "@/lib/business-registration/page-data.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Register your business" };

export default async function LogisticsRegisterBusinessPage({ searchParams }: { searchParams?: Promise<{ registration?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const [data, params] = await Promise.all([registrationPageData({ ...user, role: "logistics_partner" }), searchParams]);
  hideRegistrationPageWhenOff(data, "logistics_partner");
  return (
    <PartnerPage frame={{ user, partner }} title="Register your business" sub="Register your business name with CAC. Once approved, it counts as your CAC document.">
      <RegisterBusiness {...data} result={params?.registration ?? null} />
    </PartnerPage>
  );
}
