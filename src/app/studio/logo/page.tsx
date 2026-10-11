import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { LogoStudioClient } from "./LogoStudioClient";

export const dynamic = "force-dynamic";

export default async function LogoStudioPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace?.store ?? null)}
      title="Logo"
      sub="Tell Rex about your brand and pick from three logo ideas."
      actions={<PillLink href="/studio" icon="arrowLeft">Rex Studio</PillLink>}
    >
      <LogoStudioClient storeName={workspace?.store?.name ?? "Your Store"} />
    </SellerPage>
  );
}
