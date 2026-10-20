import type { Metadata } from "next";
import { AppPage, Card, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser } from "@/lib/role-queries";
import { ownerDeliveryAnalytics } from "@/lib/delivery-market/analytics.server";
import { readRangeDays } from "@/lib/delivery-market/analytics";
import { BreakdownCard, CountCard, IssuesCard, PartnerComparison, RangeChips, WeeklyChart, rateText } from "@/components/delivery-market/DeliveryAnalytics";
import { naira } from "@/components/delivery-market/bits";
import { durationLabel, rangeLabel } from "@/components/delivery-market/words";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("delivery"))("an.title") };
}

// A supplier's dropship deliveries over 30/90/365 days: what delivery cost, on-time and failed rates, how each
// delivery partner compares, where the parcels went and what customers reported about them.
export default async function SupplierDeliveryAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = readRangeDays((await searchParams).range);
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  const data = await ownerDeliveryAnalytics({ id: user.id, role: "supplier" }, days);
  const t = data.totals;
  const w = await getT("delivery");

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={w("an.title")}
      sub={w("an.subSupplier", { range: rangeLabel(w, days).toLowerCase() })}
      actions={<PillLink href="/supplier/delivery" icon="arrowLeft">{w("supplier.title")}</PillLink>}
      toolbar={<RangeChips path="/supplier/delivery/analytics" days={days} />}
    >
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label={w("an.deliveryFees")} value={naira(t.fees)} hint={w("an.paidInApp", { paid: naira(t.feesPaidInApp), notPaid: naira(t.feesNotInApp) })} />
          <StatTile tone="card" label={w("an.deliveries")} value={t.delivered} hint={w("an.sentToPartners", { count: t.offered })} />
          <StatTile tone="card" label={w("onTime")} value={rateText(t.onTimeRate)} hint={t.timed ? w("an.fromTimed", { count: t.timed }) : w("an.noPromised")} />
          <StatTile tone="card" label={w("failedDeliveries")} value={rateText(t.failedRate)} hint={w("an.failedHint", { attempts: t.failedAttempts, returned: t.returned })} />
          <StatTile tone="card" label={w("an.exceptions")} value={data.exceptions} hint={w("an.declinedHint", { declined: t.declined, late: t.notAcceptedInTime })} />
          <StatTile tone="card" label={w("an.acceptance")} value={rateText(t.acceptanceRate)} hint={w("an.partnersAcceptIn", { time: durationLabel(w, t.medianAcceptMs) })} />
          <StatTile tone="card" label={w("an.pickupToDelivery")} value={durationLabel(w, t.medianPickupToDeliveryMs)} hint={w("an.timeOnRoad")} />
          <StatTile tone="card" label={w("an.customerProblems")} value={data.issueCount} hint={data.openIssues ? w("an.stillOpen", { count: data.openIssues }) : w("an.noneOpen")} />
        </StatGrid>

        {t.offered === 0 && (
          <Card className="p-5">
            <p className="m-0 text-[15px] text-app-ink-soft">{w("an.emptySupplier")}</p>
          </Card>
        )}

        <PartnerComparison rows={data.partners} />

        <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
          <div className="grid min-w-0 content-start gap-5">
            <WeeklyChart weeks={data.weeks} title={w("an.perWeek")} feesLabel={w("an.deliveryFees")} />
            <BreakdownCard title={w("an.whereParcelsWent")} sub={w("an.byState")} rows={data.states} kind="state" />
          </div>
          <div className="grid min-w-0 content-start gap-5">
            <IssuesCard rows={data.issues} sub={w("an.issuesSubSupplier")} />
            <BreakdownCard title={w("an.parcelSizes")} rows={data.sizes} kind="size" />
            <CountCard title={w("an.whyDeclined")} rows={data.declineReasons} empty={w("an.noDeclines")} />
          </div>
        </div>
      </div>
    </AppPage>
  );
}
