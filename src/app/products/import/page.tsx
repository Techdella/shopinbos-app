import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { ImportForm } from "./ImportForm";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("products");
  return { title: t("import.title") };
}

export default async function ImportProductsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("products");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("import.title")}
      sub={t("import.sub")}
      actions={<PillLink href="/products" icon="arrowLeft">{t("allProducts")}</PillLink>}
    >
      <ImportForm />
    </AppPage>
  );
}
