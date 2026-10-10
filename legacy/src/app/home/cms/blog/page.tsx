import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { BlogCmsClient } from "@/app/home/cms/BlogCmsClient";
import type { StoreBrandSettings } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function BlogCmsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeName = workspace?.store?.name ?? "Your Store";
  const brandSettings = (workspace?.store?.brandSettings ?? {}) as StoreBrandSettings;
  const category = brandSettings.template?.category ?? "retail";
  const storeSlug = workspace?.store?.slug ? `${workspace.store.slug}.shopinbos.shop` : "";

  return (
    <BlogCmsClient
      storeName={storeName}
      category={category}
      storeSlug={storeSlug}
    />
  );
}
