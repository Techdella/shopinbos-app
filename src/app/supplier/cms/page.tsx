import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { PortalBlogCmsClient } from "@/components/cms/PortalBlogCmsClient";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function SupplierCmsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier");

  return (
    <AppPage
      frame={supplierFrame(user, supplier, {
        chipMode: "rail",
        chipRole: "supplier",
        chipMessage: t("cms.chipMessage"),
        chipTasks: [
          { text: t("cms.task1"), status: "auto", time: t("cms.live") },
          { text: t("cms.task2"), status: "review", time: t("cms.ready") },
        ],
      })}
      title={t("cms.title")}
      sub={t("cms.sub")}
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
