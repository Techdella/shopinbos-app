import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { brandImageIdeas } from "@shared/brand-context";
import { ImageGenClient } from "./ImageGenClient";

export const dynamic = "force-dynamic";

export default async function ImageGenPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const t = await getT("rex");
  const brand = workspace?.store ? await loadBrandContext(workspace.store.id).catch(() => null) : null;

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace?.store ?? null)}
      title={t("images.title")}
      sub={t("images.sub")}
      actions={<PillLink href="/studio" icon="arrowLeft">{t("studio.title")}</PillLink>}
    >
      <ImageGenClient
        storeName={workspace?.store?.name ?? t("studio.yourStore")}
        brand={
          brand
            ? {
                logoUrl: brand.logoUrl,
                colours: brand.colours ? [brand.colours.accent, brand.colours.button, brand.colours.ink, brand.colours.paper] : [],
                sells: brand.categories.slice(0, 4).map((category) => category.name),
                products: brand.products.slice(0, 8).map((product) => ({ name: product.name, photo: product.photo })),
              }
            : null
        }
        ideas={brandImageIdeas(brand)}
      />
    </SellerPage>
  );
}
