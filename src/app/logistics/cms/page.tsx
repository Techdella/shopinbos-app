import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PortalBlogCmsClient } from "@/components/cms/PortalBlogCmsClient";
import { AppPage } from "@/components/app-kit";
import { partnerFrame } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("cms.title") };
}

export default async function LogisticsCmsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const t = await getT("logistics");

  return (
    <AppPage
      frame={{ ...partnerFrame({ user, partner }, t), chipMessage: t("cms.chipMessage") }}
      title={t("cms.title")}
      sub={t("cms.sub")}
    >
      <PortalBlogCmsClient
        role="logistics_partner"
        businessName={partner.displayName}
        category="logistics"
        apiEndpoint="/api/logistics/blog-posts"
      />
    </AppPage>
  );
}
