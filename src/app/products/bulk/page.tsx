import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { getT } from "@/lib/i18n/server";
import { BulkAddWithPeggy } from "@/components/products/bulk/BulkAddWithPeggy";

// "Add many with Peggy" for sellers: pick many product photos, Peggy names them, price them by chatting.

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("bulkAdd");
  return { title: t("title") };
}

export default async function BulkAddPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");
  const t = await getT("bulkAdd", "products");

  return (
    <AppPage frame={sellerFrame(user, workspace.store)} title={t("title")} sub={t("entry.sub")} actions={<PillLink href="/products" icon="arrowLeft">{t("allProducts")}</PillLink>}>
      <BulkAddWithPeggy role="seller" productsHref="/products" importHref="/products/import" oneHref="/products/new" />
    </AppPage>
  );
}
