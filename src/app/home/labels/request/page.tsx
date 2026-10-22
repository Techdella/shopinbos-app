import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { isMissingTable } from "@/lib/rate-limit-core";
import { guessProductType } from "@shared/packaging";
import { RequestForm, type PastRequest } from "./RequestForm";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("packaging");
  return { title: t("req.title") };
}

// "Make my packaging for me": custom packaging, labels or a full brand pack, made (and printed) by the Shopinbos
// team, later our branding partners. ?design=<id> attaches a saved design to start from.
export default async function PackagingRequestPage({ searchParams }: { searchParams: Promise<{ design?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("packaging");
  const { design: designId } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const products = store ? await db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, category: { select: { name: true } } } }) : [];
  let design: { id: string; title: string; previewUrl: string | null; format: string | null; productType: string | null } | null = null;
  let past: PastRequest[] = [];
  let migrationNeeded = false;
  if (store) {
    try {
      const row = designId ? await db.printDesign.findFirst({ where: { id: designId, storeId: store.id }, select: { id: true, title: true, previewUrl: true, format: true, data: true } }) : null;
      if (row) design = { id: row.id, title: row.title, previewUrl: row.previewUrl, format: row.format, productType: typeof (row.data as { productType?: unknown })?.productType === "string" ? ((row.data as { productType: string }).productType) : null };
      past = (await db.packagingRequest.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 10 })).map((request) => ({ id: request.id, productName: request.productName, packType: request.packType, quantity: request.quantity, status: request.status, createdAt: request.createdAt.toISOString() }));
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      migrationNeeded = true;
    }
  }

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("req.title")} sub={t("req.sub")} actions={<PillLink href="/home/labels/packaging" icon="package">{t("req.designMyself")}</PillLink>}>
      <PageTip className="mb-5">{tipT("labels.request")}</PageTip>
      <RequestForm
        migrationNeeded={migrationNeeded}
        design={design}
        past={past}
        products={products.map((product) => ({ id: product.id, name: product.name, type: guessProductType(`${product.name} ${product.category?.name ?? ""}`) }))}
        contact={{ name: user.name ?? "", phone: user.phone ?? "", email: user.email ?? "" }}
        businessName={store?.name ?? ""}
      />
    </SellerPage>
  );
}
