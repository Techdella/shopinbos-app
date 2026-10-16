import { SupplierOnboarding } from "@/components/onboarding/SupplierOnboarding";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function SupplierOnboardingPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await db.supplier.findUnique({
    where: { userId: user.id },
    select: {
      businessName: true,
      displayName: true,
      country: true,
      city: true,
      address: true,
      postcode: true,
      addressLat: true,
      addressLng: true,
      description: true,
      categories: true,
      verificationDocuments: true,
      onboardingState: true,
    },
  });

  return (
    <SupplierOnboarding
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
