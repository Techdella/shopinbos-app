import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { CollectionDetailClient } from "./CollectionDetailClient";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) notFound();

  const collection = await db.collection.findFirst({
    where: { id, storeId: store.id },
    select: { name: true, type: true },
  });
  if (!collection) notFound();

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={collection.name}
      sub={collection.type === "auto" ? "Automatic collection" : "Manual collection: you pick the products."}
      actions={<PillLink href="/home/collections" icon="arrowLeft">All collections</PillLink>}
    >
      <CollectionDetailClient id={id} />
    </AppPage>
  );
}
