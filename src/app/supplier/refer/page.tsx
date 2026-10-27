import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { ReferEarn } from "@/components/referrals/ReferEarn";
import { referralOverview } from "@/lib/referrals/service.server";
import { ShareProfileCard } from "@/components/referrals/ShareProfileCard";
import { appBase } from "@/lib/email/compliance.server";
import { asReferralRole, profileShareLink } from "@shared/referrals";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refer & earn" };

export default async function SupplierReferPage(props: { searchParams?: Promise<{ for?: string }> }) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const focus = asReferralRole((await props.searchParams)?.for);
  const [supplier, overview] = await Promise.all([getSupplierForUser(user), referralOverview(user.id)]);
  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Refer & earn" sub="Invite other suppliers, shops and delivery partners. You both get rewarded.">
      <div className="grid gap-5">
        <ReferEarn overview={overview} focus={focus} />
        {supplier.slug && (
          <ShareProfileCard link={profileShareLink(appBase(), `/suppliers/${supplier.slug}`, overview.code)} role="supplier" verified={supplier.verificationStatus === "verified"} joined={overview.counts.fromProfile} />
        )}
      </div>
    </AppPage>
  );
}
