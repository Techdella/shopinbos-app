import { Suspense } from "react";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function LogisticsOnboardingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");

  return (
    <Suspense>
      <OnboardingFlow
        forcedRole="logistics_partner"
        initialUser={{
          name: user.name,
          city: user.city ?? null,
          country: user.country ?? null,
        }}
      />
    </Suspense>
  );
}
