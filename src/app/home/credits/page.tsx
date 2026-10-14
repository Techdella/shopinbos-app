import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { creditOverview } from "@/lib/ai/credits.server";
import { aiAllowanceToday } from "@/lib/ai/usage";
import { db } from "@/lib/db/client";
import { CREDIT_COST, CREDIT_PACKS } from "@shared/ai-credits";
import { CreditsClient } from "./CreditsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("payments");
  return { title: t("cr.title") };
}

// AI credits: what's left, the packs to buy (Paystack), auto top-up from a saved card, and past purchases.
export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ credits?: string; error?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const [t, workspace, overview, plan, query] = await Promise.all([
    getT("payments"),
    getSellerWorkspace(user.id),
    creditOverview(user.id).catch(() => ({ balance: 0, autoTopUp: false, autoPackId: null, card: null, purchases: [] })),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    searchParams,
  ]);
  const allowance = await aiAllowanceToday(user.id, plan?.aiCredits);

  return (
    <SellerPage
      user={user}
      store={storeSummary(workspace?.store ?? null)}
      title={t("cr.title")}
      sub={t("cr.sub")}
      actions={<PillLink href="/home/settings?tab=Billing" icon="arrowLeft">{t("cr.billing")}</PillLink>}
    >
      <CreditsClient
        initial={overview}
        packs={CREDIT_PACKS}
        costs={CREDIT_COST}
        allowance={allowance}
        result={query.credits === "paid" || query.credits === "failed" || query.credits === "pending" ? query.credits : null}
        resultError={query.error?.slice(0, 300) ?? null}
      />
    </SellerPage>
  );
}
