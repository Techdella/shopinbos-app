import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { getSupplierWorkspace } from "@/lib/workspace";
import { billingEmail } from "@/lib/auth/billing-email";
import { AppPage, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { getT } from "@/lib/i18n/server";
import { creditOverview } from "@/lib/ai/credits.server";
import { aiAllowanceToday } from "@/lib/ai/usage";
import { db } from "@/lib/db/client";
import { CREDIT_COST, CREDIT_PACKS } from "@shared/ai-credits";
import { CreditsClient } from "@/app/home/credits/CreditsClient";

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
    creditOverview(user.id).catch(() => ({ balance: 0, autoTopUp: false, autoPackId: null, card: null, purchases: [] })),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    searchParams,
  ]);
  const allowance = await aiAllowanceToday(user.id, plan?.aiCredits);

  return (
    <AppPage
      frame={supplierFrame({ ...user, email: billingEmail(user) }, workspace.supplier)}
      title={t("cr.title")}
      sub={t("cr.sub")}
      actions={<PillLink href="/supplier/profile?tab=Billing%20%26%20Plan" icon="arrowLeft">{t("cr.billing")}</PillLink>}
    >
      <CreditsClient
        initial={overview}
        packs={CREDIT_PACKS}
        costs={CREDIT_COST}
        allowance={allowance}
        result={query.credits === "paid" || query.credits === "failed" || query.credits === "pending" ? query.credits : null}
        resultError={query.error?.slice(0, 300) ?? null}
        returnTo="/supplier/credits"
      />
    </AppPage>
  );
}
