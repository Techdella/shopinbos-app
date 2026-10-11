import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AppFrame } from "@/components/shell/AppFrame";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getSetupOverview, syncStartNav } from "@/lib/setup/server";
import { StartHere } from "./StartHere";

// Start here: the first-time page for new sellers. A short checklist built from the real state of the shop;
// each step is done inline or one tap away, ticks itself, and can be skipped. Peggy and Rex sit alongside and
// can do the setup for you. New sellers land here after onboarding until the list is done or dismissed.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Start here" };

export default async function StartHerePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole(["seller"], "/login");

  const onboarding = await db.store.findUnique({ where: { userId: user.id }, select: { onboardingState: true, firstDashboardVisitComplete: true } });
  if (!onboarding) redirect("/onboarding/rex");
  // Same rule as Home: sellers who haven't been through the two onboarding steps finish those first.
  if (!onboarding.firstDashboardVisitComplete && ["NEW", "BUILDING_REX", null].includes(onboarding.onboardingState)) redirect("/onboarding/rex");

  const overview = await getSetupOverview(user.id);
  if (!overview) redirect("/onboarding/rex");
  // Once setup is done (or dismissed) the "Start here" menu item goes away. Only writes when it changes.
  if (!overview.checklist.showStart) await syncStartNav(user.id, false).catch((error) => console.error("[start-here] nav sync failed", error));

  const params = await searchParams;
  const launch = typeof params.launch === "string" ? params.launch : null;
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const host = overview.store.url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <AppFrame
      role="seller"
      storeName={overview.store.name}
      storeSlug={host}
      storeInitial={overview.store.name.charAt(0).toUpperCase()}
      storeLogoUrl={overview.store.logoUrl}
      userName={user.name}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <StartHere
        firstName={firstName}
        overview={JSON.parse(JSON.stringify(overview))}
        launchResult={launch === "paid" || launch === "failed" ? launch : null}
        launchError={typeof params.error === "string" ? params.error.slice(0, 300) : null}
      />
    </AppFrame>
  );
}
