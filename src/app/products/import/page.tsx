import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import products" };

export default async function ImportProductsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="Import products"
      sub="Upload a spreadsheet of your products and we'll add them to your store as drafts or live products."
      actions={<PillLink href="/products" icon="arrowLeft">All products</PillLink>}
    >
      <ImportForm />
    </AppPage>
  );
}
