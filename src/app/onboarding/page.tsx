import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { portalOnboardingPath } from "@/lib/portal-routes";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  if (params.role === "supplier") {
    redirect(portalOnboardingPath("supplier"));
  }
  if (params.role === "logistics_partner") {
    redirect(portalOnboardingPath("logistics_partner"));
  }

  const user = await getCurrentAppUser();

  if (user?.role === "supplier") {
    redirect(portalOnboardingPath("supplier"));
  }
  if (user?.role === "logistics_partner") {
    redirect(portalOnboardingPath("logistics_partner"));
  }

  if (user?.role === "seller") {
    const store = await db.store.findUnique({
      where: { userId: user.id },
      select: { onboardingState: true, firstDashboardVisitComplete: true },
    });

    if (store?.firstDashboardVisitComplete) {
      redirect("/home");
    }

    const state = store?.onboardingState;

    const completedStates = ["SKIPPED", "INCOMPLETE", "LIVE"];
    if (state && completedStates.includes(state)) {
      redirect("/home");
    }

    if (state === "BUILDING_TEMPLATE") {
      redirect("/builder/templates?onboarding=true");
    }

    // Keep marketplace intents (e.g. ?intent=add_product&productSlug=…) for after onboarding.
    const query = new URLSearchParams(Object.entries(params).filter(([key, value]) => key !== "role" && typeof value === "string") as [string, string][]).toString();
    redirect(query ? `/onboarding/rex?${query}` : "/onboarding/rex");
  }

  return (
    <Suspense>
      <OnboardingFlow
        initialUser={user ? { name: user.name, city: user.city ?? null, country: user.country ?? null } : null}
      />
    </Suspense>
  );
}
