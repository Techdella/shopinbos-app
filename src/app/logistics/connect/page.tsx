import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { Card, PillLink } from "@/components/app-kit";
import { PartnerPage } from "@/components/logistics/kit";
import { SetupHelpRequest } from "@/components/support/SetupHelpRequest";

// "Connect your system": partners never see technical settings. If they already use delivery software, they ask
// and the Shopinbos team connects it for them (the team issues and manages the connection from the admin
// logistics partner page).

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect your system" };

export default async function LogisticsConnectPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Connect your system"
      sub="Already use delivery software? Our team can connect it to Shopinbos for you, so jobs show up there automatically."
    >
      <div className="grid max-w-[720px] gap-5">
        <SetupHelpRequest
          title="Connect your delivery software"
          description="Tell us which software you use and how to reach you. We'll do the rest."
          feature="logistics_api"
          softwareQuestion="Which software or app do you use?"
          softwarePlaceholder="e.g. Shipbubble, our own system"
        />

        <Card className="flex flex-wrap items-center gap-4 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/app/rex.png" alt="" className="h-14 w-14 shrink-0 object-contain" />
          <p className="m-0 min-w-[200px] flex-1 text-[15px] leading-[1.55]">
            <strong>No delivery software?</strong> You don&apos;t need any. Your riders can use the free Shopinbos Riders app on their phones.
          </p>
          <PillLink href="/logistics/couriers" size="sm">See your riders</PillLink>
        </Card>
      </div>
    </PartnerPage>
  );
}
