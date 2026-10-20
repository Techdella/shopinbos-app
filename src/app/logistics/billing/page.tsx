import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { Card, CardHead, EmptyState, ListCard, ListRow, StatGrid, StatTile } from "@/components/app-kit";
import { KeyValue, PartnerPage, StatusPill, lagosDate, naira } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";
import { PromoBanner } from "@/components/pricing/PromoBanner";
import { logisticsJobFee } from "@shared/platform-pricing";
import { planOf } from "@/lib/plan-limits";
import { planOffers } from "@/lib/plans/catalog.server";
import { creditBalance } from "@/lib/ai/credits.server";
import { billingEmail } from "@/lib/auth/billing-email";
import { PlanPicker } from "@/components/payments/PlanPicker";
import { coverageStateCount } from "@/lib/plan-limits";
import { logisticsLimits } from "@shared/plans";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("fees.title") };
}

export default async function LogisticsBillingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const t = await getT("logistics", "common");

  const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } });
  const plan = planOf({ role: "logistics_partner", aiCredits: dbUser?.aiCredits });
  const [book, bookings, offers, credits, teamCount] = await Promise.all([
    getPriceBook(),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, deliveryFee: true, platformFee: true, feeBearer: true,
        netAmount: true, currency: true, status: true, createdAt: true,
        seller: { select: { name: true } },
      },
    }),
    planOffers(),
    creditBalance(user.id),
    db.logisticsTeamMember.count({ where: { logisticsPartnerId: partner.id, status: "active" } }),
  ]);

  // The job fee follows the partner's plan (Admin › Pricing sets the rates and whether it's charged yet). It comes
  // out of the partner's share of the delivery fee. Jobs record what was actually taken.
  const fee = logisticsJobFee(book, plan);
  const rate = fee.rate;
  const feeOf = (booking: (typeof bookings)[number]) => booking.platformFee;
  const limits = logisticsLimits(plan);
  const delivered = bookings.filter((booking) => booking.status === "delivered");
  const totalGross = delivered.reduce((sum, booking) => sum + booking.deliveryFee, 0);
  const totalFees = delivered.reduce((sum, booking) => sum + feeOf(booking), 0);
  const totalNet = delivered.reduce((sum, booking) => sum + (booking.netAmount || booking.deliveryFee - feeOf(booking)), 0);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("fees.title")}
      sub={fee.charged ? t("fees.subOn", { rate }) : t("fees.subOff", { rate })}
    >
      <PromoBanner role="logistics_partner" className="mb-5" />
      <StatGrid className="mb-5 md:grid-cols-3">
        <StatTile tone="card" label={t("fees.earned")} value={naira(totalGross)} hint={t("fees.deliveredJobsCount", { count: delivered.length })} />
        <StatTile tone="card" label={t("fees.shopinbosFees", { rate })} value={naira(totalFees)} />
        <StatTile tone="card" label={t("fees.yours")} value={naira(totalNet)} className="col-span-2 md:col-span-1" />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <section aria-labelledby="fee-history" className="min-w-0">
          <h2 id="fee-history" className="m-0 mb-3 text-[18px] font-extrabold">{t("fees.eachJob")}</h2>
          {bookings.length === 0 ? (
            <EmptyState icon="document" title={t("jobs.emptyTitle")}>{t("fees.emptyBody")}</EmptyState>
          ) : (
            <ListCard>
              {bookings.slice(0, 50).map((booking) => {
                const fee = feeOf(booking);
                return (
                  <ListRow key={booking.id}>
                    <div className="min-w-0 flex-1 basis-[160px]">
                      <div className="truncate text-[15px] font-extrabold">{booking.seller.name}</div>
                      <div className="truncate text-[15px] text-app-ink-soft">
                        {lagosDate(booking.createdAt, undefined, new Date(), t)}
                      </div>
                    </div>
                    <StatusPill status={booking.status} />
                    <div className="text-[15px] text-app-ink-soft">{naira(booking.deliveryFee)} − {naira(fee)}</div>
                    <div className="ml-auto text-[15px] font-extrabold">{naira(booking.netAmount || booking.deliveryFee - fee)}</div>
                  </ListRow>
                );
              })}
            </ListCard>
          )}
        </section>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title={t("fees.summary")} />
            <div className="mt-2 divide-y divide-app-line">
              <KeyValue label={t("fees.rate")}>{fee.charged ? `${rate}%` : t("fees.offNow", { rate })}</KeyValue>
              <KeyValue label={t("earnings.deliveredJobs")}>{delivered.length}</KeyValue>
              <KeyValue label={t("fees.soFar")}>{naira(totalFees)}</KeyValue>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <PlanPicker
          role="logistics_partner"
          current={plan}
          offers={offers}
          userEmail={billingEmail(user)}
          userName={user.name}
          creditBalance={credits}
          creditsHref="/logistics/credits"
          usage={[
            { label: t("fees.usageStates"), used: coverageStateCount(partner.coverageZones, partner.coverageMap as never), limit: limits.coverageStates },
            { label: t("fees.usageTeam"), used: teamCount, limit: limits.teamMembers },
          ]}
        />
      </div>
    </PartnerPage>
  );
}
