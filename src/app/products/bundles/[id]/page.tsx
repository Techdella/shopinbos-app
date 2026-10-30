import { notFound, redirect } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { getT } from "@/lib/i18n/server";
import { bundleChoices, sellerBundles } from "@/lib/products/bundles.server";
import { BundleForm } from "@/components/products/BundleForm";

// Edit a bundle: the same form, filled in. Its items stay listed even when one can't go in a new bundle any more.

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("bundles");
  return { title: t("form.editTitle") };
}

export default async function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");
  const t = await getT("bundles");
  const [[bundle], choices] = await Promise.all([sellerBundles(workspace.store.id, id), bundleChoices(workspace.store.id)]);
  if (!bundle) notFound();
  // Items no longer offered (archived since) still show so the seller sees and can remove them.
  const known = new Set(choices.map((choice) => choice.id));
  // Same for a size picked that is no longer offered (switched off since): it shows as gone until another is picked.
  const extra = bundle.items
    .filter((item, index, all) => !known.has(item.productId) && all.findIndex((other) => other.productId === item.productId) === index)
    .map((item) => ({
      id: item.productId,
      name: item.name || "?",
      images: item.image ? [item.image] : [],
      retailPrice: item.price,
      status: item.missing ? "archived" : "published",
      stock: 0,
      variants: bundle.items.filter((other) => other.productId === item.productId && other.variantId && other.variant).map((other) => ({ id: other.variantId!, name: other.variant!, price: other.price, stock: 0, image: other.image })),
    }));
  return (
    <AppPage frame={sellerFrame(user, workspace.store)} title={t("form.editTitle")} sub={bundle.name} actions={<PillLink href="/products/bundles" icon="arrowLeft">{t("allBundles")}</PillLink>}>
      <BundleForm
        choices={[...choices, ...extra]}
        initial={{ id: bundle.id, name: bundle.name, description: bundle.description, image: bundle.image, price: bundle.price, status: bundle.status, items: bundle.items.map((item) => ({ productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : {}), quantity: item.quantity })) }}
      />
    </AppPage>
  );
}
