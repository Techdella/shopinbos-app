import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { CategoriesClient } from "./CategoriesClient";

export const dynamic = "force-dynamic";

export default async function SellerCategoriesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const { new: openForm } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="Categories"
      sub="Products sorted into categories show up together on your storefront."
      actions={<PillLink href="/home/categories?new=1" tone="accent" icon="plus">Add category</PillLink>}
    >
      <CategoriesClient startOpen={openForm === "1"} />
    </AppPage>
  );
}
