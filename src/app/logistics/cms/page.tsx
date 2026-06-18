import { AppFrame } from "@/components/shell/AppFrame";
import { TopBar } from "@/components/shell/TopBar";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PortalBlogCmsClient } from "@/components/cms/PortalBlogCmsClient";

export const dynamic = "force-dynamic";

export default async function LogisticsCmsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  return (
    <AppFrame
      role="logistics_partner"
      chipMode="rail"
      chipRole="logistics_partner"
      chipMessage="Your blog is set up. Rex can write full SEO articles for your logistics profile."
      chipTasks={[
        { text: "Blog CMS is ready for drafts and publishing", status: "auto", time: "live" },
        { text: "Rex can write long-form SEO articles from a prompt", status: "review", time: "ready" },
      ]}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <TopBar
        eyebrow="CMS"
        title="Blog and articles"
        subtitle="Rex writes the content. Keep your blog connected to your logistics profile."
      />

      <PortalBlogCmsClient
        role="logistics_partner"
        businessName={partner.displayName}
        category="logistics"
        apiEndpoint="/api/logistics/blog-posts"
      />
    </AppFrame>
  );
}
