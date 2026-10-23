import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { ReferEarn } from "@/components/referrals/ReferEarn";
import { referralOverview } from "@/lib/referrals/service.server";
import { asReferralRole } from "@shared/referrals";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refer & earn" };

export default async function LogisticsReferPage(props: { searchParams?: Promise<{ for?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const focus = asReferralRole((await props.searchParams)?.for);
  const [partner, overview] = await Promise.all([getLogisticsPartnerForUser(user), referralOverview(user.id)]);
  return (
    <PartnerPage frame={{ user, partner }} title="Refer & earn" sub="Invite other delivery partners, shops and suppliers. You both get rewarded.">
      <ReferEarn overview={overview} focus={focus} />
    </PartnerPage>
  );
}
