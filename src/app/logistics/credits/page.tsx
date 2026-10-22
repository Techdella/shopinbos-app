import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PillLink } from "@/components/app-kit";
import { PartnerPage } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";
import { isAppSession } from "@/lib/app-session.server";
import { creditOverview, liveCreditPrices } from "@/lib/ai/credits.server";
import { CreditsClient } from "@/app/home/credits/CreditsClient";
import { PromoBanner } from "@/components/pricing/PromoBanner";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("payments");
  return { title: t("cr.title") };
}

// AI credits for delivery partners: the same balance, packs and auto top-up as sellers and suppliers, with the
// prices of the partner's own AI actions (rate cards from price lists, coverage listings, chat replies, reports).
export default async function LogisticsCreditsPage({ searchParams }: { searchParams: Promise<{ credits?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const [t, overview, prices, query, inApp] = await Promise.all([
    getT("payments"),
    creditOverview(user.id).catch(() => ({ balance: 0, planCredits: 0, bought: 0, nextExpiry: null, autoTopUp: false, autoPackId: null, card: null, purchases: [] })),
    liveCreditPrices(),
    searchParams,
    isAppSession(),
  ]);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("cr.title")}
      sub={t("cr.sub")}
      actions={<PillLink href="/logistics/billing" icon="arrowLeft">{t("cr.billing")}</PillLink>}
    >
      {inApp ? (
        <p className="m-0 text-[14px] leading-[1.5]">{t("app.billingOff")}</p>
      ) : (
        <>
          <PromoBanner role="logistics_partner" className="mb-5" />
          <CreditsClient
            initial={overview}
            packs={prices.packs}
            costs={prices.costs}
            result={query.credits === "paid" || query.credits === "failed" || query.credits === "pending" ? query.credits : null}
            resultError={query.error?.slice(0, 300) ?? null}
            returnTo="/logistics/credits"
            role="logistics_partner"
          />
        </>
      )}
    </PartnerPage>
  );
}
