import { redirect } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { getT } from "@/lib/i18n/server";
import { bundleChoices } from "@/lib/products/bundles.server";
import { BundleForm } from "@/components/products/BundleForm";

// Make a bundle: the form with the store's products a bundle can hold (shared/bundles.ts).

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("bundles");
  return { title: t("form.newTitle") };
}

export default async function NewBundlePage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");
  const t = await getT("bundles");
  const choices = await bundleChoices(workspace.store.id);
  return (
    <AppPage frame={sellerFrame(user, workspace.store)} title={t("form.newTitle")} sub={t("sub")} actions={<PillLink href="/products/bundles" icon="arrowLeft">{t("allBundles")}</PillLink>}>
      <BundleForm choices={choices} />
    </AppPage>
  );
}
