import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { ImageGenClient } from "./ImageGenClient";

export const dynamic = "force-dynamic";

export default async function ImageGenPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace?.store ?? null)}
      title="Images"
      sub="Ask Rex for product photos, banners and brand pictures."
      actions={<PillLink href="/studio" icon="arrowLeft">Rex Studio</PillLink>}
    >
      <ImageGenClient storeName={workspace?.store?.name ?? "Your Store"} />
    </SellerPage>
  );
}
