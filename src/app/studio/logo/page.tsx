import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { LogoStudioClient } from "./LogoStudioClient";

export const dynamic = "force-dynamic";

export default async function LogoStudioPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const t = await getT("rex");

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace?.store ?? null)}
      title={t("logo.title")}
      sub={t("logo.sub")}
      actions={<PillLink href="/studio" icon="arrowLeft">{t("studio.title")}</PillLink>}
    >
      <LogoStudioClient storeName={workspace?.store?.name ?? t("studio.yourStore")} />
    </SellerPage>
  );
}
