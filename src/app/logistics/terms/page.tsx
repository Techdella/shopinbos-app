import type { Metadata } from "next";
import { Card, TextLink } from "@/components/app-kit";
import { PartnerPage, lagosDate } from "@/components/logistics/kit";
import { requireRole } from "@/lib/server-auth";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PARTNER_TERMS_VERSION } from "@shared/partner-tiers";
import { getT } from "@/lib/i18n/server";

// Delivery partner terms, accepted at company setup (LogisticsOnboarding) and again in Verification when
// PARTNER_TERMS_VERSION changes. DRAFT WORDING: have a lawyer review it before relying on it (spec note).

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("partnerKyc"))("terms.title") };
}

export default async function PartnerTermsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  const t = await getT("partnerKyc");
  const accepted = partner.termsVersion === PARTNER_TERMS_VERSION && partner.termsAcceptedAt;
  return (
    <PartnerPage frame={{ user, partner }} title={t("terms.title")} sub={t("terms.sub")}>
      <Card className="max-w-[760px] p-5 sm:p-6">
        <ol className="m-0 grid gap-3 pl-5 text-[15px] leading-[1.55]">
          {[t("terms.point1"), t("terms.point2"), t("terms.point3"), t("terms.point4")].map((point) => <li key={point}>{point}</li>)}
        </ol>
        <p className="mb-0 mt-5 text-[14px] text-app-ink-soft">
          {accepted ? t("terms.accepted", { date: lagosDate(partner.termsAcceptedAt!, { day: "numeric", month: "long", year: "numeric" }) }) : t("terms.mustAccept")}
        </p>
        <div className="mt-4"><TextLink href="/logistics/verification?step=review">{t("help.back")}</TextLink></div>
      </Card>
    </PartnerPage>
  );
}
