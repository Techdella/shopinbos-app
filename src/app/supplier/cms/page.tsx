import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { PortalBlogCmsClient } from "@/components/cms/PortalBlogCmsClient";

export const dynamic = "force-dynamic";

export default async function SupplierCmsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  return (
    <AppPage
      frame={supplierFrame(user, supplier, {
        chipMode: "rail",
        chipRole: "supplier",
        chipMessage: "Your blog is set up. Rex can write full SEO articles for your supplier profile.",
        chipTasks: [
          { text: "Blog CMS is ready for drafts and publishing", status: "auto", time: "live" },
          { text: "Rex can write long-form SEO articles from a prompt", status: "review", time: "ready" },
        ],
      })}
      title="Blog and articles"
      sub="Rex writes the articles. They sit on your supplier page so sellers searching for what you make can find you."
    >
      <PortalBlogCmsClient
        role="supplier"
        businessName={supplier.displayName}
        category={supplier.categories?.[0] ?? "manufacturing"}
        apiEndpoint="/api/supplier/blog-posts"
      />
    </AppPage>
  );
}
