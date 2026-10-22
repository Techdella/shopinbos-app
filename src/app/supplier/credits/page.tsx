import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSupplierWorkspace } from "@/lib/workspace";
import { billingEmail } from "@/lib/auth/billing-email";
import { AppPage, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { getT } from "@/lib/i18n/server";
import { isAppSession } from "@/lib/app-session.server";
import { creditOverview, liveCreditPrices } from "@/lib/ai/credits.server";
import { db } from "@/lib/db/client";
import { CreditsClient } from "@/app/home/credits/CreditsClient";
import { PromoBanner } from "@/components/pricing/PromoBanner";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("payments");
  return { title: t("cr.title") };
}

// AI credits in the supplier portal: the same balance, packs and auto top-up as sellers (/home/credits), in the
// supplier frame, with Paystack bringing the supplier back here.
export default async function SupplierCreditsPage({ searchParams }: { searchParams: Promise<{ credits?: string; error?: string }> }) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const workspace = await getSupplierWorkspace(user.id);
  if (!workspace) redirect("/supplier/onboarding");
  const [t, overview, plan, query] = await Promise.all([
    getT("payments"),
    creditOverview(user.id).catch(() => ({ balance: 0, planCredits: 0, bought: 0, nextExpiry: null, autoTopUp: false, autoPackId: null, card: null, purchases: [] })),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    searchParams,
  ]);
  const prices = await liveCreditPrices();

  const inApp = await isAppSession();

  return (
    <AppPage
      frame={supplierFrame({ ...user, email: billingEmail(user) }, workspace.supplier)}
      title={t("cr.title")}
      sub={t("cr.sub")}
      actions={<PillLink href="/supplier/profile?tab=Billing%20%26%20Plan" icon="arrowLeft">{t("cr.billing")}</PillLink>}
    >
      {inApp ? (
        <p className="m-0 text-[14px] leading-[1.5]">{t("app.billingOff")}</p>
      ) : (
        <>
          <PromoBanner role="supplier" className="mb-5" />
          <CreditsClient
            initial={overview}
            packs={prices.packs}
            costs={prices.costs}
            result={query.credits === "paid" || query.credits === "failed" || query.credits === "pending" ? query.credits : null}
            resultError={query.error?.slice(0, 300) ?? null}
            role="supplier"
            returnTo="/supplier/credits"
          />
        </>
      )}
    </AppPage>
  );
}
