import { AppFrame } from "@/components/shell/AppFrame";
import { TopBar } from "@/components/shell/TopBar";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { PortalBlogCmsClient } from "@/components/cms/PortalBlogCmsClient";

export const dynamic = "force-dynamic";

export default async function SupplierCmsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  return (
    <AppFrame
      role="supplier"
      chipMode="rail"
      chipRole="supplier"
      chipMessage="Your blog is set up. Rex can write full SEO articles for your supplier profile."
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
        subtitle="Rex writes the content. Keep your blog connected to your supplier profile."
      />

      <PortalBlogCmsClient
        role="supplier"
        businessName={supplier.displayName}
        category={supplier.categories?.[0] ?? "manufacturing"}
        apiEndpoint="/api/supplier/blog-posts"
      />
    </AppFrame>
  );
}
