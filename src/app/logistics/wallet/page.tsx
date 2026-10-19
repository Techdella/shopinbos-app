import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { loadWalletView } from "@/lib/wallet/wallet.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shopinbos Wallet" };

export default async function LogisticsWalletPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const view = await loadWalletView({ id: user.id, role: "logistics_partner" });
  return (
    <PartnerPage frame={{ user, partner }} title="Shopinbos Wallet" sub="Get your ID and bank ready so delivery payments can go straight to your bank.">
      <WalletPanel view={view} role="logistics_partner" ownerName={user.name} />
    </PartnerPage>
  );
}
