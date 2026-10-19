import { Suspense } from "react";
import { LogisticsOnboarding } from "@/components/onboarding/LogisticsOnboarding";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function LogisticsOnboardingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");

  return (
    <Suspense>
      <LogisticsOnboarding
        initialUser={{
          name: user.name,
          city: user.city ?? null,
          country: user.country ?? null,
        }}
      />
    </Suspense>
  );
}
