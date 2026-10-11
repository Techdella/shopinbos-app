import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { CustomiseMenu } from "@/components/settings/CustomiseMenu";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customise your menu" };

export default async function SellerFeaturesPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });
  return (
    <SellerPage user={user} store={storeSummary(store)} title="Customise your menu" sub="Switch off the parts of Shopinbos you don't need. They leave your menu; nothing is deleted.">
      <CustomiseMenu role="seller" />
    </SellerPage>
  );
}
