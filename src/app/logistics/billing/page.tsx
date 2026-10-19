import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { getPriceBook } from "@/lib/pricing/price-book.server";
import { Card, CardHead, EmptyState, ListCard, ListRow, StatGrid, StatTile } from "@/components/app-kit";
import { KeyValue, PartnerPage, StatusPill, lagosDate, naira } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";
import { PromoBanner } from "@/components/pricing/PromoBanner";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("fees.title") };
}

const BEARERS: Record<string, string> = {
  seller: "The seller (added to their delivery cost)",
  supplier: "The supplier on the order",
  logistics_partner: "You (taken from your payout)",
};

export default async function LogisticsBillingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const t = await getT("logistics", "common");
  const bearerShort = (value: string) => (BEARERS[value] ? t.dynamic(`fees.bearerShort.${value}`, value.replace(/_/g, " ")) : value.replace(/_/g, " "));

  const [book, bookings] = await Promise.all([
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
  ]);

  // Shopinbos sets the rate and who pays it (Admin › Pricing); partners see it here but can't change it.
  const rate = book["delivery.fee_rate"];
  const bearer = book["delivery.fee_bearer"];
  const feeOf = (booking: (typeof bookings)[number]) => booking.platformFee || Math.round((booking.deliveryFee * rate) / 100);
  const delivered = bookings.filter((booking) => booking.status === "delivered");
  const totalGross = delivered.reduce((sum, booking) => sum + booking.deliveryFee, 0);
  const totalFees = delivered.reduce((sum, booking) => sum + feeOf(booking), 0);
  const totalNet = delivered.reduce((sum, booking) => sum + (booking.netAmount || booking.deliveryFee - feeOf(booking)), 0);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("fees.title")}
      sub={t("fees.sub", { rate, who: t.dynamic(`fees.bearerWho.${bearer}`, (BEARERS[bearer] ?? bearer).split(" (")[0].toLowerCase()) })}
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
                        {lagosDate(booking.createdAt, undefined, new Date(), t)} · {t("fees.paidByWho", { who: bearerShort(booking.feeBearer || bearer) })}
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
              <KeyValue label={t("fees.rate")}>{rate}%</KeyValue>
              <KeyValue label={t("jobs.paidBy")}>{bearerShort(bearer)}</KeyValue>
              <KeyValue label={t("earnings.deliveredJobs")}>{delivered.length}</KeyValue>
              <KeyValue label={t("fees.soFar")}>{naira(totalFees)}</KeyValue>
            </div>
          </Card>
        </div>
      </div>
    </PartnerPage>
  );
}
