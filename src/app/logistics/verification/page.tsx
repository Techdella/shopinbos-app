import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { PartnerVerificationFlow } from "@/components/logistics/verification/PartnerVerificationFlow";
import { getT } from "@/lib/i18n/server";

// Delivery partner verification in tiers (shared/partner-tiers.ts): Tier 1 Verified Individual without CAC, Tier 2
// Registered Business with it. The steps are client-side (src/components/logistics/verification).

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("partnerKyc"))("page.title") };
}

export default async function LogisticsVerificationPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  const t = await getT("partnerKyc");
  return (
    <PartnerPage frame={{ user, partner }} title={t("page.title")} sub={t("page.sub")}>
      <PartnerVerificationFlow accountEmail={user.email ?? null} accountPhone={user.phone ?? null} />
    </PartnerPage>
  );
}
