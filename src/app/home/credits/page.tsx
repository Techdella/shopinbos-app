import { requireRole } from "@/lib/server-auth";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { isAppSession } from "@/lib/app-session.server";
import { creditOverview, liveCreditPrices } from "@/lib/ai/credits.server";
import { db } from "@/lib/db/client";
import { CreditsClient } from "./CreditsClient";
import { PromoBanner } from "@/components/pricing/PromoBanner";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("payments");
  return { title: t("cr.title") };
}

// AI credits: what's left, the packs to buy (Paystack), auto top-up from a saved card, and past purchases.
export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ credits?: string; error?: string }> }) {
  const current = await getCurrentAppUser();
  if (current?.role === "supplier") redirect("/supplier/credits");
  const user = await requireRole(["seller"], "/login");
  const [t, workspace, overview, plan, query] = await Promise.all([
    getT("payments"),
    getSellerWorkspace(user.id),
    creditOverview(user.id).catch(() => ({ balance: 0, planCredits: 0, bought: 0, nextExpiry: null, autoTopUp: false, autoPackId: null, card: null, purchases: [] })),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    searchParams,
  ]);
  const prices = await liveCreditPrices();

  const inApp = await isAppSession();

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace?.store ?? null)}
      title={t("cr.title")}
      sub={t("cr.sub")}
      actions={<PillLink href="/home/settings?tab=Billing" icon="arrowLeft">{t("cr.billing")}</PillLink>}
    >
      {inApp ? (
        <p className="m-0 text-[14px] leading-[1.5]">{t("app.billingOff")}</p>
      ) : (
        <>
          <PromoBanner role="seller" className="mb-5" />
          <CreditsClient
            initial={overview}
            packs={prices.packs}
            costs={prices.costs}
            result={query.credits === "paid" || query.credits === "failed" || query.credits === "pending" ? query.credits : null}
            resultError={query.error?.slice(0, 300) ?? null}
          />
        </>
      )}
    </SellerPage>
  );
}
