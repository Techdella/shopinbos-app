import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { loadWalletView } from "@/lib/wallet/wallet.server";
import { cashOwedToSeller } from "@/lib/logistics/seller-payins.server";
import { CashToReceive } from "@/components/wallet/CashToReceive";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shopinbos Wallet" };

export default async function SellerWalletPage() {
  const user = await requireRole(["seller"], "/login");
  const [store, view, cash] = await Promise.all([
    db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } }),
    loadWalletView({ id: user.id, role: "seller" }),
    cashOwedToSeller(user.id),
  ]);
  return (
    <SellerPage user={user} store={storeSummary(store)} title="Shopinbos Wallet" sub="Card payments from your store go straight to your bank.">
      {view.settlement.status !== "active" ? (
        <p className="m-0 mb-5 rounded-[18px] border border-app-line bg-white px-4 py-3 text-[14px] leading-[1.5]">
          Your store takes card payments once your wallet is set up. Until then customers can still pay by bank transfer or on delivery.
        </p>
      ) : null}
      <div className="mb-5"><CashToReceive rows={cash} /></div>
      <WalletPanel view={view} role="seller" ownerName={user.name} orderHref={(orderId) => `/home/orders/${orderId}`} />
      <p className="m-0 mt-5 rounded-[18px] border border-app-line bg-white px-4 py-3 text-[14px] leading-[1.5]">
        Not registered with CAC yet? <a href="/home/register-business" className="font-bold underline underline-offset-4">Register your business name</a> without leaving Shopinbos.
      </p>
    </SellerPage>
  );
}
