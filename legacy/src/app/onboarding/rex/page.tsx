import { Suspense } from "react";
import { getCurrentAppUser } from "@/lib/server-auth";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { STORE_LAUNCH_DEPOSIT_NGN, STORE_LAUNCH_TOTAL_NGN } from "@/lib/store-launch-billing";
import { db } from "@/lib/db/client";
import { parseOnboardingMemory } from "@/lib/onboarding-memory";

export const dynamic = "force-dynamic";

export default async function RexOnboardingPage() {
  const user = await getCurrentAppUser();
  const store = user
    ? await db.store.findUnique({ where: { userId: user.id }, select: { brandSettings: true, status: true } })
    : null;
  const settings = store?.brandSettings && typeof store.brandSettings === "object" && !Array.isArray(store.brandSettings)
    ? store.brandSettings as Record<string, unknown>
    : null;
  const initialMemory = parseOnboardingMemory(settings?.onboardingMemory);
  return (
    <Suspense>
      <OnboardingFlow
        initialUser={user ? { name: user.name, city: user.city ?? null, country: user.country ?? null } : null}
        initialMemory={initialMemory}
        initialLaunchStatus={store?.status ?? null}
        launchPricing={{ total: STORE_LAUNCH_TOTAL_NGN, deposit: STORE_LAUNCH_DEPOSIT_NGN }}
        forcedRole="seller"
      />
    </Suspense>
  );
}
