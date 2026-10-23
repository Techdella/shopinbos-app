import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { ReferEarn } from "@/components/referrals/ReferEarn";
import { referralOverview } from "@/lib/referrals/service.server";
import { asReferralRole } from "@shared/referrals";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refer & earn" };

export default async function SellerReferPage(props: { searchParams?: Promise<{ for?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const focus = asReferralRole((await props.searchParams)?.for);
  const [store, overview] = await Promise.all([
    db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } }),
    referralOverview(user.id),
  ]);
  return (
    <SellerPage user={user} store={storeSummary(store)} title="Refer & earn" sub="Invite suppliers, sellers and delivery partners. You both get rewarded.">
      <ReferEarn overview={overview} focus={focus} />
    </SellerPage>
  );
}
