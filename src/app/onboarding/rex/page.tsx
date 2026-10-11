import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/workspace";
import { getSellerOnboardingStatus } from "@/lib/onboarding-status";
import { SellerOnboarding } from "@/components/onboarding/seller/SellerOnboarding";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Set up your shop" };

// Seller onboarding (2026 redesign). Paystack launch payments return here with ?launch=paid|failed.
export default async function SellerOnboardingPage() {
  const user = await requireRole(["seller"], "/login");

  let status = await getSellerOnboardingStatus(user.id);
  if (!status) {
    const name = `${user.name.split(" ")[0] || "My"}'s Store`;
    await db.store.create({
      data: {
        userId: user.id,
        name,
        slug: `${slugify(name)}-${user.id.slice(0, 6)}`,
        country: user.country || "Nigeria",
        city: user.city || "Lagos",
        status: "draft",
        onboardingState: "NEW",
      },
    });
    status = await getSellerOnboardingStatus(user.id);
  }
  if (!status) redirect("/home");

  return (
    <Suspense>
      <SellerOnboarding initialStatus={JSON.parse(JSON.stringify(status))} />
    </Suspense>
  );
}
