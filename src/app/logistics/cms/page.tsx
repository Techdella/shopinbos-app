import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PortalBlogCmsClient } from "@/components/cms/PortalBlogCmsClient";
import { AppPage } from "@/components/app-kit";
import { partnerFrame } from "@/components/logistics/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blog" };

export default async function LogisticsCmsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  return (
    <AppPage
      frame={{ ...partnerFrame({ user, partner }), chipMessage: "Your blog is ready. Rex can write articles that help sellers find you on Google." }}
      title="Blog"
      sub="Articles on your public partner page. Rex can write a draft from a short prompt; you check it and publish."
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
