import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { slugify } from "@/lib/workspace";
import intentRouting from "@/lib/intent-routing";
import { getSellerOnboardingStatus } from "@/lib/onboarding-status";
import { SellerOnboarding } from "@/components/onboarding/seller/SellerOnboarding";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("onboarding");
  return { title: t("seller.metaTitle") };
}

// Seller onboarding (2026 redesign), two steps: what you sell, then name and look. The rest of setup lives on
// Start here (/home/start).
export default async function SellerOnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole(["seller"], "/login");
  const params = await searchParams;

  // Launch payments started from the older flow still return here with ?launch=paid|failed.
  if (typeof params.launch === "string") {
    const query = new URLSearchParams({ launch: params.launch, ...(typeof params.error === "string" ? { error: params.error } : {}) });
    redirect(`/home/start?${query}`);
  }

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

  // Sellers who were past the brand step in the longer flow carry on from Start here.
  const screen = status.memory?.screen;
  if (status.finished || screen === "products" || screen === "payments") {
    if (!status.finished) {
      await db.store.update({ where: { id: status.store.id }, data: { firstDashboardVisitComplete: true, onboardingState: status.store.live ? "LIVE" : "INCOMPLETE" } });
    }
    const intent = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    redirect(intent.intent ? intentRouting.getContinuationPath({ role: "seller", ...intent }) : "/home/start");
  }

  return (
    <Suspense>
      <SellerOnboarding initialStatus={JSON.parse(JSON.stringify(status))} />
    </Suspense>
  );
}
