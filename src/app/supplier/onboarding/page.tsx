import { SupplierOnboarding } from "@/components/onboarding/SupplierOnboarding";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { idCheckState } from "@/lib/wallet/id-check-state.server";
import { syncIdentityDocFromWallet } from "@/lib/kyb/identity-doc.server";

export const dynamic = "force-dynamic";

export default async function SupplierOnboardingPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  await syncIdentityDocFromWallet(user.id, "supplier");
  const idCheck = await idCheckState(user.id);
  const supplier = await db.supplier.findUnique({
    where: { userId: user.id },
    select: {
      businessName: true,
      displayName: true,
      country: true,
      city: true,
      address: true,
      description: true,
      categories: true,
      verificationDocuments: true,
      onboardingState: true,
    },
  });

  return (
    <SupplierOnboarding
      idCheck={idCheck}
      initialUser={{
        name: user.name,
        city: user.city ?? null,
        country: user.country ?? null,
      }}
      initialSupplier={
        supplier
          ? {
              ...supplier,
              verificationDocuments: Array.isArray(supplier.verificationDocuments) ? (supplier.verificationDocuments as any) : null,
              onboardingState:
                supplier.onboardingState && typeof supplier.onboardingState === "object" && !Array.isArray(supplier.onboardingState)
                  ? (supplier.onboardingState as any)
                  : null,
            }
          : null
      }
    />
  );
}
