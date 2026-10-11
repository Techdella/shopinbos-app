import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { CartSettings } from "./CartSettings";

export const dynamic = "force-dynamic";

export default async function CommerceCartPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Cart" sub="Choose how your cart looks and behaves in your store.">
      <CartSettings />
    </SellerPage>
  );
}
