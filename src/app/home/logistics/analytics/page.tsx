import type { Metadata } from "next";
import { AppPage, Card, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { ownerDeliveryAnalytics } from "@/lib/delivery-market/analytics.server";
import { RANGE_LABELS, durationWords, readRangeDays } from "@/lib/delivery-market/analytics";
import { BreakdownCard, CountCard, IssuesCard, PartnerComparison, RangeChips, WeeklyChart, rateText } from "@/components/delivery-market/DeliveryAnalytics";
import { naira } from "@/components/delivery-market/bits";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery analytics" };

// A shop's deliveries over 30/90/365 days (spec Phase 3): what it spent, how many arrived on time, failed attempts
// and exceptions, how each partner compares, where its customers are, and what customers reported.
export default async function SellerDeliveryAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = readRangeDays((await searchParams).range);
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  const data = await ownerDeliveryAnalytics({ id: user.id, role: "seller" }, days);
  const t = data.totals;

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title="Delivery analytics"
      sub={`How your deliveries went · ${RANGE_LABELS[days].toLowerCase()}`}
      actions={
        <>
          <PillLink href="/home/logistics" icon="arrowLeft">Logistics</PillLink>
          <PillLink href="/home/logistics/exceptions">Exceptions</PillLink>
        </>
      }
      toolbar={<RangeChips path="/home/logistics/analytics" days={days} />}
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Delivery spend" value={naira(t.fees)} hint={`${naira(t.feesPaidInApp)} paid in the app · ${naira(t.feesNotInApp)} not`} />
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
            <p className="m-0 text-[15px] text-app-ink-soft">No deliveries in this period yet. Once your partners deliver orders, you&apos;ll see how they did here.</p>
          </Card>
        )}

        <PartnerComparison rows={data.partners} />

        <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
          <div className="grid min-w-0 content-start gap-5">
            <WeeklyChart weeks={data.weeks} feesLabel="Spend" />
            <BreakdownCard title="Where your customers are" sub="Deliveries by state" rows={data.states} kind="state" />
          </div>
          <div className="grid min-w-0 content-start gap-5">
            <IssuesCard rows={data.issues} sub="What customers reported on their orders" />
            <BreakdownCard title="Services" rows={data.services} kind="service" />
            <CountCard title="Why partners declined" rows={data.declineReasons} empty="No partner declined a delivery in this period." />
          </div>
        </div>
      </div>
    </AppPage>
  );
}
