import type { Metadata } from "next";
import { AppPage, Card, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser } from "@/lib/role-queries";
import { ownerDeliveryAnalytics } from "@/lib/delivery-market/analytics.server";
import { RANGE_LABELS, durationWords, readRangeDays } from "@/lib/delivery-market/analytics";
import { BreakdownCard, CountCard, IssuesCard, PartnerComparison, RangeChips, WeeklyChart, rateText } from "@/components/delivery-market/DeliveryAnalytics";
import { naira } from "@/components/delivery-market/bits";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery analytics" };

// A supplier's dropship deliveries over 30/90/365 days: what delivery cost, on-time and failed rates, how each
// delivery partner compares, where the parcels went and what customers reported about them.
export default async function SupplierDeliveryAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = readRangeDays((await searchParams).range);
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  const data = await ownerDeliveryAnalytics({ id: user.id, role: "supplier" }, days);
  const t = data.totals;

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title="Delivery analytics"
      sub={`How your dropship deliveries went · ${RANGE_LABELS[days].toLowerCase()}`}
      actions={<PillLink href="/supplier/delivery" icon="arrowLeft">Delivery</PillLink>}
      toolbar={<RangeChips path="/supplier/delivery/analytics" days={days} />}
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Delivery fees" value={naira(t.fees)} hint={`${naira(t.feesPaidInApp)} paid in the app · ${naira(t.feesNotInApp)} not`} />
          <StatTile tone="card" label="Deliveries" value={t.delivered} hint={`${t.offered} sent to partners`} />
          <StatTile tone="card" label="On time" value={rateText(t.onTimeRate)} hint={t.timed ? `From ${t.timed} deliveries with a promised time` : "No promised times yet"} />
          <StatTile tone="card" label="Failed deliveries" value={rateText(t.failedRate)} hint={`${t.failedAttempts} failed attempts · ${t.returned} returned`} />
          <StatTile tone="card" label="Exceptions" value={data.exceptions} hint={`${t.declined} declined · ${t.notAcceptedInTime} not accepted in time`} />
          <StatTile tone="card" label="Acceptance rate" value={rateText(t.acceptanceRate)} hint={`Partners usually accept in ${durationWords(t.medianAcceptMs)}`} />
          <StatTile tone="card" label="Pickup to delivery" value={durationWords(t.medianPickupToDeliveryMs)} hint="Typical time on the road" />
          <StatTile tone="card" label="Customer problems" value={data.issueCount} hint={data.openIssues ? `${data.openIssues} still open` : "None open"} />
        </StatGrid>

        {t.offered === 0 && (
          <Card className="p-5">
            <p className="m-0 text-[15px] text-app-ink-soft">No deliveries in this period yet. When shops sell your products by dropship, your partners&apos; deliveries show here.</p>
          </Card>
        )}

        <PartnerComparison rows={data.partners} />

        <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
          <div className="grid min-w-0 content-start gap-5">
            <WeeklyChart weeks={data.weeks} feesLabel="Delivery fees" />
            <BreakdownCard title="Where parcels went" sub="Deliveries by state" rows={data.states} kind="state" />
          </div>
          <div className="grid min-w-0 content-start gap-5">
            <IssuesCard rows={data.issues} sub="What customers reported on your parcels" />
            <BreakdownCard title="Parcel sizes" rows={data.sizes} kind="size" />
            <CountCard title="Why partners declined" rows={data.declineReasons} empty="No partner declined a delivery in this period." />
          </div>
        </div>
      </div>
    </AppPage>
  );
}
