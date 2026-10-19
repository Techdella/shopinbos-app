import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { Card, PillLink } from "@/components/app-kit";
import { PartnerPage } from "@/components/logistics/kit";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";
import { Mascot } from "@/components/brand/Mascot";
import { getT } from "@/lib/i18n/server";

// "Connect your system": partners never see technical settings. If they already use delivery software, they ask
// and the Shopinbos team connects it for them (the team issues and manages the connection from the admin
// logistics partner page).

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("connect.title") };
}

export default async function LogisticsConnectPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const t = await getT("logistics");

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("connect.title")}
      sub={t("connect.sub")}
    >
      <div className="grid max-w-[720px] gap-5">
        <SetupHelpRequest
          title={t("connect.helpTitle")}
          description={t("connect.helpDescription")}
          feature="logistics_api"
          softwareQuestion={t("connect.softwareQuestion")}
          softwarePlaceholder={t("connect.softwarePlaceholder")}
        />

        <Card className="flex flex-wrap items-center gap-4 p-5">
          <Mascot who="rex" size={56} decorative />
          <p className="m-0 min-w-[200px] flex-1 text-[15px] leading-[1.55]">
            <strong>{t("connect.noSoftware")}</strong> {t("connect.noSoftwareBody")}
          </p>
          <PillLink href="/logistics/couriers" size="sm">{t("connect.seeRiders")}</PillLink>
        </Card>
      </div>
    </PartnerPage>
  );
}
