import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { CheckoutSettings } from "./CheckoutSettings";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Checkout" sub="Choose how checkout looks and what shoppers fill in before they pay.">
      <CheckoutSettings />
    </SellerPage>
  );
}
