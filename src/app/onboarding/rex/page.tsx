import { Suspense } from "react";
import { getCurrentAppUser } from "@/lib/server-auth";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export const dynamic = "force-dynamic";

export default async function RexOnboardingPage() {
  const user = await getCurrentAppUser();
  return (
    <Suspense>
      <OnboardingFlow
        initialUser={user ? { name: user.name, city: user.city ?? null, country: user.country ?? null } : null}
        forcedRole="seller"
      />
    </Suspense>
  );
}
