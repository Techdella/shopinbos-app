import { redirect } from "next/navigation";
import { SupplierOnboarding } from "@/components/onboarding/SupplierOnboarding";
import { supplierOnboardingView } from "@/lib/kyc/supplier-onboarding.server";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Supplier onboarding, one question per screen (src/components/onboarding/SupplierOnboarding.tsx), resuming on the
// screen saved last.
export default async function SupplierOnboardingPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const view = await supplierOnboardingView(user.id);
  if (!view) redirect("/supplier/login");
  return <SupplierOnboarding initialView={JSON.parse(JSON.stringify(view))} />;
}
