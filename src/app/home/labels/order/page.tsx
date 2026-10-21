import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { loadPackagingDesign } from "@/lib/packaging/designs.server";
import { OrderPrints } from "./OrderPrints";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("packaging");
  return { title: t("order.title") };
}

// Order prints of a saved packaging design: options, an instant price, delivery, and Paystack.
export default async function OrderPrintsPage({ searchParams }: { searchParams: Promise<{ design?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("packaging");
  const { design: designId } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, city: true } });
  const saved = store && designId ? await loadPackagingDesign(store.id, designId).catch(() => null) : null;
  if (!saved) redirect("/home/labels/packaging");
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("order.title")} sub={t("order.sub")} actions={<PillLink href={`/home/labels/packaging?design=${saved.id}`} icon="edit">{t("order.edit")}</PillLink>}>
      <PageTip className="mb-5">{tipT("labels.order")}</PageTip>
      <OrderPrints design={{ id: saved.id, title: saved.title, design: saved.design }} contact={{ name: user.name ?? "", phone: user.phone ?? "", city: store?.city ?? "" }} />
    </SellerPage>
  );
}
