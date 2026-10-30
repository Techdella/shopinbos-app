import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { featureOn } from "@/lib/feature-switches.server";
import { followersOverview } from "@/lib/followers/blasts.server";
import { getT } from "@/lib/i18n/server";
import { FollowersClient } from "./FollowersClient";

// Notify my followers (pilot feature "notify_followers"; shared/follower-blasts.ts): follower count, who each channel
// reaches, "2 of 3 left this week", the composer (kind, words, optional product, preview) and what was sent before.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("followers");
  return { title: t("title") };
}

export default async function FollowersPage() {
  const user = await requireRole(["seller"], "/login");
  if (!(await featureOn(user.id, "notify_followers"))) notFound();
  const t = await getT("followers");
  const tm = await getT("marketing");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/onboarding");
  const overview = await followersOverview(store);

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("sub")} actions={<PillLink href="/home/marketing" icon="arrowLeft">{tm("hub.title")}</PillLink>}>
      <FollowersClient overview={JSON.parse(JSON.stringify(overview))} />
    </SellerPage>
  );
}
