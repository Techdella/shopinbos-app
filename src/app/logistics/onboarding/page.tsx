import { Suspense } from "react";
import { LogisticsOnboarding } from "@/components/onboarding/LogisticsOnboarding";
import { requireRole } from "@/lib/server-auth";
import { idCheckState } from "@/lib/wallet/id-check-state.server";
import { syncIdentityDocFromWallet } from "@/lib/kyb/identity-doc.server";

export const dynamic = "force-dynamic";

export default async function LogisticsOnboardingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  await syncIdentityDocFromWallet(user.id, "logistics_partner");
  const idCheck = await idCheckState(user.id);

  return (
    <Suspense>
      <LogisticsOnboarding
        idCheck={idCheck}
        initialUser={{
          name: user.name,
          city: user.city ?? null,
          country: user.country ?? null,
        }}
      />
    </Suspense>
  );
}
