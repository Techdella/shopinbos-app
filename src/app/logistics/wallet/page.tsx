import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { loadWalletView } from "@/lib/wallet/wallet.server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("wallet"))("page.title") };
}

export default async function LogisticsWalletPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const view = await loadWalletView({ id: user.id, role: "logistics_partner" });
  const t = await getT("wallet");
  return (
    <PartnerPage frame={{ user, partner }} title={t("page.title")} sub={t("page.subPartner")}>
      <WalletPanel view={view} role="logistics_partner" ownerName={user.name} />
    </PartnerPage>
  );
}
