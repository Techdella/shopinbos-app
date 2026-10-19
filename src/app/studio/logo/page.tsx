import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { LogoStudioClient } from "./LogoStudioClient";

export const dynamic = "force-dynamic";

export default async function LogoStudioPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const t = await getT("rex");
  const brand = workspace?.store ? await loadBrandContext(workspace.store.id).catch(() => null) : null;

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace?.store ?? null)}
      title={t("logo.title")}
      sub={t("logo.sub")}
      actions={<PillLink href="/studio" icon="arrowLeft">{t("studio.title")}</PillLink>}
    >
      <LogoStudioClient storeName={workspace?.store?.name ?? t("studio.yourStore")} about={brand?.business ?? ""} currentLogo={workspace?.store?.logoUrl ?? null} />
    </SellerPage>
  );
}
