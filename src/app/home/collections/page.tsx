import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { CollectionsClient } from "./CollectionsClient";

export const dynamic = "force-dynamic";

export default async function SellerCollectionsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const { new: openForm } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="Collections"
      sub="Group products into collections for easier browsing and promotions."
      actions={<PillLink href="/home/collections?new=1" tone="accent" icon="plus">Create collection</PillLink>}
    >
      <CollectionsClient startOpen={openForm === "1"} />
    </AppPage>
  );
}
