import type { Metadata } from "next";
import { AppPage, AssistantNote, Card, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { ownerDeliveryAnalytics } from "@/lib/delivery-market/analytics.server";
import { readRangeDays } from "@/lib/delivery-market/analytics";
import { BreakdownCard, CountCard, IssuesCard, PartnerComparison, RangeChips, WeeklyChart, rateText } from "@/components/delivery-market/DeliveryAnalytics";
import { naira } from "@/components/delivery-market/bits";
import { durationLabel, rangeLabel } from "@/components/delivery-market/words";
import { DeliveryTip } from "@/components/delivery-market/DeliveryTip";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("delivery"))("an.title") };
}

// A shop's deliveries over 30/90/365 days (spec Phase 3): what it spent, how many arrived on time, failed attempts
// and exceptions, how each partner compares, where its customers are, and what customers reported.
export default async function SellerDeliveryAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = readRangeDays((await searchParams).range);
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  const data = await ownerDeliveryAnalytics({ id: user.id, role: "seller" }, days);
  const t = data.totals;
  const w = await getT("delivery");

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title={w("an.title")}
      sub={w("an.subSeller", { range: rangeLabel(w, days).toLowerCase() })}
      actions={
        <>
          <PillLink href="/home/logistics" icon="arrowLeft">{w("logistics")}</PillLink>
          <PillLink href="/home/logistics/exceptions">{w("an.exceptions")}</PillLink>
        </>
      }
      toolbar={<RangeChips path="/home/logistics/analytics" days={days} />}
    >
      <div className="grid gap-5">
        <DeliveryTip>
          <AssistantNote who="peggy">{w("an.tip")}</AssistantNote>
        </DeliveryTip>
        <StatGrid>
          <StatTile tone="card" label={w("an.spend")} value={naira(t.fees)} hint={w("an.paidInApp", { paid: naira(t.feesPaidInApp), notPaid: naira(t.feesNotInApp) })} />
          <StatTile tone="card" label={w("an.deliveries")} value={t.delivered} hint={w("an.sentToPartners", { count: t.offered })} />
          <StatTile tone="card" label={w("onTime")} value={rateText(t.onTimeRate)} hint={t.timed ? w("an.fromTimed", { count: t.timed }) : w("an.noPromised")} />
          <StatTile tone="card" label={w("an.exceptions")} value={data.exceptions} hint={w("an.declinedHint", { declined: t.declined, late: t.notAcceptedInTime })} />
        </StatGrid>
        <details className="group rounded-[18px] border border-app-line bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-[14.5px] font-extrabold [&::-webkit-details-marker]:hidden">
            {w("an.moreNumbers")}
            <span aria-hidden className="text-[18px] font-bold text-app-ink-soft transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="border-t border-app-line p-4">
            <StatGrid>
              <StatTile tone="card" label={w("failedDeliveries")} value={rateText(t.failedRate)} hint={w("an.failedHint", { attempts: t.failedAttempts, returned: t.returned })} />
              <StatTile tone="card" label={w("an.acceptance")} value={rateText(t.acceptanceRate)} hint={w("an.partnersAcceptIn", { time: durationLabel(w, t.medianAcceptMs) })} />
              <StatTile tone="card" label={w("an.pickupToDelivery")} value={durationLabel(w, t.medianPickupToDeliveryMs)} hint={w("an.timeOnRoad")} />
              <StatTile tone="card" label={w("an.customerProblems")} value={data.issueCount} hint={data.openIssues ? w("an.stillOpen", { count: data.openIssues }) : w("an.noneOpen")} />
            </StatGrid>
          </div>
        </details>

        {t.offered === 0 && (
          <Card className="p-5">
            <p className="m-0 text-[15px] text-app-ink-soft">{w("an.emptySeller")}</p>
          </Card>
        )}

        <PartnerComparison rows={data.partners} />

        <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_420px]">
          <div className="grid min-w-0 content-start gap-5">
            <WeeklyChart weeks={data.weeks} title={w("an.perWeek")} feesLabel={w("an.spendShort")} />
            <BreakdownCard title={w("an.whereCustomers")} sub={w("an.byState")} rows={data.states} kind="state" />
          </div>
          <div className="grid min-w-0 content-start gap-5">
            <IssuesCard rows={data.issues} sub={w("an.issuesSubSeller")} />
            <BreakdownCard title={w("services")} rows={data.services} kind="service" />
            <CountCard title={w("an.whyDeclined")} rows={data.declineReasons} empty={w("an.noDeclines")} />
          </div>
        </div>
      </div>
    </AppPage>
  );
}
