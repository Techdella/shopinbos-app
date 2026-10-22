import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { WalletBalanceCard } from "@/components/wallet/WalletBalanceCard";
import { loadWalletView } from "@/lib/wallet/wallet.server";
import { cashOwedToSeller } from "@/lib/logistics/seller-payins.server";
import { CashToReceive } from "@/components/wallet/CashToReceive";
import { getT } from "@/lib/i18n/server";
import { registrationEnabled } from "@/lib/business-registration/service.server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("wallet"))("page.title") };
}

export default async function SellerWalletPage(props: { searchParams?: Promise<{ topup?: string }> }) {
  const topup = (await props.searchParams)?.topup ?? null;
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("wallet");
  const [store, view, cash, registrationOpen] = await Promise.all([
    db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } }),
    loadWalletView({ id: user.id, role: "seller" }),
    cashOwedToSeller(user.id),
    registrationEnabled().catch(() => false),
  ]);
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("page.title")} sub={t("page.subSeller")}>
      <PageTip className="mb-5">{tipT("wallet")}</PageTip>
      {view.settlement.status !== "active" ? (
        <p className="m-0 mb-5 rounded-[18px] border border-app-line bg-white px-4 py-3 text-[14px] leading-[1.5]">
          {t("page.sellerNotReady")}
        </p>
      ) : null}
      <div className="mb-5"><CashToReceive rows={cash} /></div>
      <WalletBalanceCard returnTo="/home/wallet" notice={topup} />
      <WalletPanel view={view} role="seller" ownerName={user.name} orderHref={(orderId) => `/home/orders/${orderId}`} />
      {registrationOpen ? (
        <p className="m-0 mt-5 rounded-[18px] border border-app-line bg-white px-4 py-3 text-[14px] leading-[1.5]">
          Not registered with CAC yet? <a href="/home/register-business" className="font-bold underline underline-offset-4">Register your business name</a> without leaving Shopinbos.
        </p>
      ) : null}
    </SellerPage>
  );
}
