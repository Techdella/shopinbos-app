import type { Metadata } from "next";
import { Card, PillLink, TextLink } from "@/components/app-kit";
import { PartnerPage } from "@/components/logistics/kit";
import { requireRole } from "@/lib/server-auth";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { registrationEnabled } from "@/lib/business-registration/service.server";
import { getT } from "@/lib/i18n/server";

// "Don't have CAC? Learn how to register" from the verification flow: registering is never required to deliver on
// Shopinbos, it lifts the Tier 1 limits (Registered Business). Links to registering through Shopinbos when that's open.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("partnerKyc"))("help.title") };
}

export default async function CacHelpPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  const [t, throughUs] = await Promise.all([getT("partnerKyc"), registrationEnabled(user.id).catch(() => false)]);
  const steps = [t("help.step1"), t("help.step2"), t("help.step3"), t("help.step4"), t("help.step5")];
  return (
    <PartnerPage frame={{ user, partner }} title={t("help.title")} sub={t("help.sub")}>
      <Card className="max-w-[760px] p-5 sm:p-6">
        <ol className="m-0 grid list-none gap-4 p-0">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-[15px] leading-[1.55]">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-ink text-[13px] font-extrabold text-white">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <PillLink href="https://icrp.cac.gov.ng" tone="ink">{t("help.portal")}</PillLink>
          {throughUs && <PillLink href="/logistics/register-business">{t("help.throughUs")}</PillLink>}
          <TextLink href="/logistics/verification?step=cac">{t("help.back")}</TextLink>
        </div>
      </Card>
    </PartnerPage>
  );
}
